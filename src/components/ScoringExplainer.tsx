import React from 'react';

export default function ScoringExplainer() {
  return (
    <section id="scoring" className="border-t border-[#242938] bg-[#0A0B10] py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-[var(--font-outfit)]">
            Transparent Scoring, Not a Single Opaque "Virality" Number
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#9AA2B6] leading-relaxed">
            Most clipping tools give you an arbitrary score like "89% Viral" without explaining why a segment was cut. FLOWZORA Clips evaluates every candidate segment across four distinct dimensions via structured Gemini API reasoning.
          </p>
        </div>

        {/* 4 Dimension Matrix */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#242938] bg-[#141620] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-[var(--font-outfit)]">1. Hook Strength</h3>
              <span className="rounded bg-[#FF5722]/15 px-2 py-0.5 text-xs font-bold text-[#FF5722]">0 – 10</span>
            </div>
            <p className="mt-2 text-xs text-[#9AA2B6] leading-relaxed">
              Evaluates the first 3–5 seconds. Does the speaker start with a bold statement, surprising data point, contrarian opinion, or an open curiosity loop that halts scrolling?
            </p>
          </div>

          <div className="rounded-xl border border-[#242938] bg-[#141620] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-[var(--font-outfit)]">2. Standalone Coherence</h3>
              <span className="rounded bg-[#FFB800]/15 px-2 py-0.5 text-xs font-bold text-[#FFB800]">0 – 10</span>
            </div>
            <p className="mt-2 text-xs text-[#9AA2B6] leading-relaxed">
              Checks if the clip makes sense in isolation. Candidates relying on unintroduced names or dangling conversational references are downranked or re-snapped to topic boundaries.
            </p>
          </div>

          <div className="rounded-xl border border-[#242938] bg-[#141620] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-[var(--font-outfit)]">3. Emotional Payoff</h3>
              <span className="rounded bg-[#3B82F6]/15 px-2 py-0.5 text-xs font-bold text-[#3B82F6]">0 – 10</span>
            </div>
            <p className="mt-2 text-xs text-[#9AA2B6] leading-relaxed">
              Scores the resolution of the segment. Does the clip deliver on the hook with an actionable takeaway, a moment of vulnerability, or a memorable philosophical punchline?
            </p>
          </div>

          <div className="rounded-xl border border-[#242938] bg-[#141620] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-[var(--font-outfit)]">4. Topic-Trend Alignment</h3>
              <span className="rounded bg-[#10B981]/15 px-2 py-0.5 text-xs font-bold text-[#10B981]">0 – 10</span>
            </div>
            <p className="mt-2 text-xs text-[#9AA2B6] leading-relaxed">
              Measures resonance with current Indian creator topics (startup building, career growth, financial freedom, creator economy, cultural commentary).
            </p>
          </div>
        </div>

        {/* Quality-driven Count vs Fixed-Interval Chunking */}
        <div className="mt-6 rounded-xl border border-[#242938] bg-[#141620] p-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-[#FF5722]">
            Quality-Driven Yield Over Artificial Quotas
          </h3>
          <p className="mt-2 text-xs text-[#9AA2B6] leading-relaxed">
            Regional competitors (e.g. Clipzi) slice long audio into naive 60-second fixed intervals every 3 minutes. In reality, a 45-minute podcast might genuinely contain only 6–8 viral moments. FLOWZORA Clips uses sliding-window sentence alignment with overlap deduplication, returning only the clips that exceed the quality bar.
          </p>
        </div>
      </div>
    </section>
  );
}
