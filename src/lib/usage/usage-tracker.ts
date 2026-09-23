import { getSupabaseAdmin, inMemoryDb } from '@/lib/db/supabase';

/**
 * Estimate-based daily usage tracker for every AI API the pipeline calls.
 *
 * None of the free tiers we use (Cloudflare Workers AI, Groq, Gemini) expose
 * a "quota remaining" endpoint, and all keys are the operator's — shared
 * across every visitor. So this ledger records each call's consumption and
 * subtracts from the documented free-tier daily caps. Numbers are estimates
 * (labeled as such in the UI), resetting daily at midnight Pacific Time —
 * matching Google's RPD reset and used as the common reset for all providers.
 */

export type UsageProvider =
  | 'cloudflare'
  | 'groq-transcribe'
  | 'openai-transcribe'
  | 'gemini'
  | 'groq-scoring';

export type UsageKind = 'audio-min' | 'request' | 'token';

export interface UsageEvent {
  provider: UsageProvider;
  kind: UsageKind;
  amount: number;
}

export interface ProviderUsage {
  provider: UsageProvider;
  label: string;
  unit: string;
  /** Consumed since midnight PT, in `unit`. */
  used: number;
  /** Daily cap in `unit`, or null when uncapped (pay-as-you-go). Env-overridable. */
  limit: number | null;
  remaining: number | null;
  /** 0-100, or null when uncapped. */
  pctUsed: number | null;
  estimated: true;
}

export interface UsageSummary {
  /** PT calendar day, YYYY-MM-DD. */
  day: string;
  /** Seconds until the next midnight-PT reset. */
  resetsInSec: number;
  providers: ProviderUsage[];
}

interface ProviderDef {
  provider: UsageProvider;
  label: string;
  unit: string;
  kind: UsageKind;
  limit: number | null;
}

function envNum(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function providerDefs(): ProviderDef[] {
  return [
    {
      provider: 'cloudflare',
      label: 'Cloudflare Whisper Turbo',
      unit: 'audio min',
      kind: 'audio-min',
      // Free tier ≈ one 3-hour video/day (10,000 neurons/day).
      limit: envNum('CF_DAILY_AUDIO_MIN_LIMIT', 180),
    },
    {
      provider: 'groq-transcribe',
      label: 'Groq Whisper (backup)',
      unit: 'audio min',
      kind: 'audio-min',
      // Free tier ≈ 8 hours of audio/day.
      limit: envNum('GROQ_DAILY_AUDIO_MIN_LIMIT', 480),
    },
    {
      provider: 'openai-transcribe',
      label: 'OpenAI Whisper (paid backup)',
      unit: 'audio min',
      kind: 'audio-min',
      limit: null,
    },
    {
      provider: 'gemini',
      label: 'Gemini scoring',
      unit: 'requests',
      kind: 'request',
      limit: envNum('GEMINI_DAILY_REQUEST_LIMIT', 500),
    },
    {
      provider: 'groq-scoring',
      label: 'Groq scoring (backup)',
      unit: 'tokens',
      kind: 'token',
      limit: envNum('GROQ_DAILY_TOKEN_LIMIT', 100000),
    },
  ];
}

/** Start of the current PT day, as a UTC Date. */
export function ptDayStartUtc(now = new Date()): Date {
  const [y, m, d] = ptDayKey(now).split('-').map(Number);
  // Convert 00:00 PT wall time to UTC. The PT offset depends on the instant
  // (DST), so refine with two iterations — converges for all real zones.
  let guess = Date.UTC(y, m - 1, d, 8);
  for (let i = 0; i < 3; i++) {
    const offMin = ptOffsetMinutes(new Date(guess));
    guess = Date.UTC(y, m - 1, d, 0, 0, 0) - offMin * 60_000;
  }
  return new Date(guess);
}

/** Minutes ahead of UTC for America/Los_Angeles at the given instant. */
function ptOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute)
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function ptDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function secondsToNextPtMidnight(now = new Date()): number {
  const start = ptDayStartUtc(now);
  const next = new Date(start.getTime() + 24 * 3600_000);
  return Math.max(0, Math.round((next.getTime() - now.getTime()) / 1000));
}

/**
 * Records one consumption event. Never throws — usage tracking must not
 * break the pipeline it observes.
 */
export async function recordApiUsage(event: UsageEvent): Promise<void> {
  try {
    if (!Number.isFinite(event.amount) || event.amount <= 0) return;
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from('api_usage').insert({
        provider: event.provider,
        kind: event.kind,
        amount: event.amount,
      });
    } else {
      const key = `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      inMemoryDb.usageEvents.set(key, {
        provider: event.provider,
        kind: event.kind,
        amount: event.amount,
        created_at: new Date().toISOString(),
      });
    }
  } catch {
    // Swallowed on purpose — see docstring.
  }
}

/** Sums today's usage per provider and computes remaining quota. */
export async function getUsageSummary(now = new Date()): Promise<UsageSummary> {
  const dayStart = ptDayStartUtc(now);
  const defs = providerDefs();
  const totals = new Map<string, number>();

  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from('api_usage')
        .select('provider, kind, amount')
        .gte('created_at', dayStart.toISOString());
      for (const row of data || []) {
        const key = `${row.provider}:${row.kind}`;
        totals.set(key, (totals.get(key) || 0) + Number(row.amount || 0));
      }
    } else {
      for (const row of inMemoryDb.usageEvents.values()) {
        if (new Date(row.created_at).getTime() < dayStart.getTime()) continue;
        const key = `${row.provider}:${row.kind}`;
        totals.set(key, (totals.get(key) || 0) + Number(row.amount || 0));
      }
    }
  } catch {
    // On read failure return zeroed usage rather than a 500.
  }

  const providers: ProviderUsage[] = defs.map((d) => {
    const used = round1(totals.get(`${d.provider}:${d.kind}`) || 0);
    const remaining = d.limit === null ? null : Math.max(0, round1(d.limit - used));
    const pctUsed =
      d.limit === null ? null : Math.min(100, Math.round((used / d.limit) * 100));
    return {
      provider: d.provider,
      label: d.label,
      unit: d.unit,
      used,
      limit: d.limit,
      remaining,
      pctUsed,
      estimated: true as const,
    };
  });

  return { day: ptDayKey(now), resetsInSec: secondsToNextPtMidnight(now), providers };
}

/** Rough token estimate for chat text (≈4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
