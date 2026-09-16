import { getSupabaseAdmin, inMemoryDb } from '../db/supabase';

const DEFAULT_MONTHLY_BUDGET_CAP_USD = 50.00;
const MAX_FREE_REQUESTS_PER_HOUR = 5;

// In-memory sliding-window rate limiter
const rateLimitMap = new Map<string, number[]>();

export interface SpendStatus {
  monthKey: string;
  totalCostUsd: number;
  budgetCapUsd: number;
  percentUsed: number;
  isKillSwitchActive: boolean;
  message?: string;
}

/**
 * Gets current month key in 'YYYY-MM' format.
 */
function getCurrentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Checks if the aggregate monthly AI spend kill switch has been triggered.
 */
export async function checkSpendKillSwitch(): Promise<SpendStatus> {
  const monthKey = getCurrentMonthKey();
  const supabase = getSupabaseAdmin();
  let totalCost = 0;
  let budgetCap = DEFAULT_MONTHLY_BUDGET_CAP_USD;
  let isCapped = false;

  if (supabase) {
    const { data } = await supabase
      .from('spend_ledger')
      .select('*')
      .eq('month_key', monthKey)
      .single();

    if (data) {
      totalCost = Number(data.total_cost_usd || 0);
      budgetCap = Number(data.budget_cap_usd || DEFAULT_MONTHLY_BUDGET_CAP_USD);
      isCapped = data.status === 'capped' || totalCost >= budgetCap;
    }
  } else {
    const record = inMemoryDb.spendLedger.get(monthKey);
    if (record) {
      totalCost = record.total_cost_usd;
      budgetCap = record.budget_cap_usd;
      isCapped = record.status === 'capped' || totalCost >= budgetCap;
    }
  }

  const percentUsed = Number(((totalCost / budgetCap) * 100).toFixed(1));

  return {
    monthKey,
    totalCostUsd: totalCost,
    budgetCapUsd: budgetCap,
    percentUsed,
    isKillSwitchActive: isCapped,
    message: isCapped
      ? 'Monthly free-tier capacity ceiling has been reached for this cycle. Paid top-up jobs continue with dedicated priority.'
      : undefined,
  };
}

/**
 * Records accrued AI API spend (Whisper + Gemini) to the monthly spend ledger.
 */
export async function recordApiSpend(costUsd: number): Promise<SpendStatus> {
  const monthKey = getCurrentMonthKey();
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data } = await supabase
      .from('spend_ledger')
      .select('*')
      .eq('month_key', monthKey)
      .single();

    const currentTotal = data ? Number(data.total_cost_usd) : 0;
    const newTotal = Number((currentTotal + costUsd).toFixed(4));
    const isCapped = newTotal >= DEFAULT_MONTHLY_BUDGET_CAP_USD;

    await supabase.from('spend_ledger').upsert({
      month_key: monthKey,
      total_cost_usd: newTotal,
      budget_cap_usd: DEFAULT_MONTHLY_BUDGET_CAP_USD,
      status: isCapped ? 'capped' : 'open',
      updated_at: new Date().toISOString(),
    });
  } else {
    let record = inMemoryDb.spendLedger.get(monthKey);
    if (!record) {
      record = {
        month_key: monthKey,
        total_cost_usd: 0,
        budget_cap_usd: DEFAULT_MONTHLY_BUDGET_CAP_USD,
        status: 'open',
      };
      inMemoryDb.spendLedger.set(monthKey, record);
    }
    record.total_cost_usd = Number((record.total_cost_usd + costUsd).toFixed(4));
    if (record.total_cost_usd >= record.budget_cap_usd) {
      record.status = 'capped';
    }
  }

  return checkSpendKillSwitch();
}

/**
 * Rate limits requests by IP and client fingerprint (sliding 1-hour window).
 */
export function checkRateLimit(clientId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  const timestamps = rateLimitMap.get(clientId) || [];
  const recentTimestamps = timestamps.filter((t) => t > oneHourAgo);

  if (recentTimestamps.length >= MAX_FREE_REQUESTS_PER_HOUR) {
    rateLimitMap.set(clientId, recentTimestamps);
    return { allowed: false, remaining: 0 };
  }

  recentTimestamps.push(now);
  rateLimitMap.set(clientId, recentTimestamps);

  return {
    allowed: true,
    remaining: MAX_FREE_REQUESTS_PER_HOUR - recentTimestamps.length,
  };
}
