'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';

interface ProviderUsage {
  provider: string;
  label: string;
  unit: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  pctUsed: number | null;
}

interface UsageSummary {
  success: boolean;
  day: string;
  resetsInSec: number;
  providers: ProviderUsage[];
}

function formatCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatNum(n: number, unit: string): string {
  const rounded = unit === 'tokens' ? Math.round(n).toLocaleString('en-IN') : String(n);
  return `${rounded} ${unit}`;
}

/**
 * Site-wide daily API quota panel. Estimates only — free tiers expose no
 * live "quota left" endpoint, so usage is metered locally per call and
 * subtracted from each provider's documented free-tier cap.
 */
export default function UsageTracker() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/usage', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setSummary(data);
    } catch {
      // Panel simply stays empty when the API is unreachable.
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!summary) return null;

  return (
    <section className="relative border-t border-[#262626] bg-[#000000]/40 py-10 sm:py-14">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#262626] bg-[#050505] p-4 text-left transition-colors hover:border-[#3a3a3a] sm:p-5"
        >
          <span className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-[#10B981]" />
            <span className="text-xs font-mono uppercase tracking-wider text-[#A1A1A1]">
              Daily API Quota — Estimated
            </span>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-[#6B7280]">
              resets in {formatCountdown(summary.resetsInSec)}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-[#A1A1A1] transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </button>

        {open && (
          <div className="mt-3 rounded-xl border border-[#262626] bg-[#050505] p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summary.providers
                .filter((p) => p.limit !== null)
                .map((p) => (
                  <div key={p.provider} className="rounded-lg border border-[#262626] bg-black/40 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-white">{p.label}</span>
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          (p.pctUsed ?? 0) >= 90
                            ? 'text-[#EF4444]'
                            : (p.pctUsed ?? 0) >= 70
                              ? 'text-[#F59E0B]'
                              : 'text-[#10B981]'
                        }`}
                      >
                        {p.remaining} left
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#262626]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (p.pctUsed ?? 0) >= 90
                            ? 'bg-[#EF4444]'
                            : (p.pctUsed ?? 0) >= 70
                              ? 'bg-[#F59E0B]'
                              : 'bg-[#10B981]'
                        }`}
                        style={{ width: `${Math.min(100, p.pctUsed ?? 0)}%` }}
                      />
                    </div>
                    <div className="mt-1.5 font-mono text-[10px] text-[#6B7280]">
                      {formatNum(p.used, p.unit)} used / {formatNum(p.limit ?? 0, p.unit)} daily cap
                    </div>
                  </div>
                ))}
            </div>

            <p className="mt-3 text-[10px] leading-relaxed text-[#525252]">
              Estimated from metered usage since midnight PT — providers publish no live quota endpoint.
              Shared across all users of this deployment.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
