import React from 'react';

export default function ScoringExplainer() {
  return (
    <section id="scoring" className="relative border-t border-[#262626] bg-[#000000]/40 backdrop-blur-[2px] py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-wider text-[#A1A1A1] mb-2">
            Structured Evaluation Matrix
          </div>
          <h2 className="text-2xl sm:text-4xl font-semibold text-white tracking-[-0.03em] text-balance">
            Transparent Scoring, Not an Opaque “Virality” Number
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#A1A1A1] leading-relaxed">
            Most clipping tools output an arbitrary score like “89% Viral” without explaining why a segment was cut. FLOWZORA Clips evaluates every candidate segment across four distinct dimensions via structured Gemini API reasoning — with a Groq LLM backup if Gemini hits quota — then fuses zero-cost audio signals (energy peaks, speech excitement) into the final rank.
          </p>
        </div>

        {/* 4 Dimension Matrix */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 hover:border-[#383838] transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">1. Hook Strength</h3>
              <span className="font-mono rounded-[4px] bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 text-xs font-semibold text-[#10B981] tabular-nums">
                0 – 10
              </span>
            </div>
            <p className="mt-2.5 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
              Evaluates the first 3–5 seconds. Does the speaker start with a bold statement, surprising data point, contrarian opinion, or an open curiosity loop that halts scrolling?
            </p>
          </div>

          <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 hover:border-[#383838] transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">2. Standalone Coherence</h3>
              <span className="font-mono rounded-[4px] bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 text-xs font-semibold text-[#10B981] tabular-nums">
                0 – 10
              </span>
            </div>
            <p className="mt-2.5 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
              Checks if the clip makes sense in isolation. Candidates relying on unintroduced names or dangling conversational references are downranked or re-snapped to topic boundaries.
            </p>
          </div>

          <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 hover:border-[#383838] transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">3. Emotional Payoff</h3>
              <span className="font-mono rounded-[4px] bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 text-xs font-semibold text-[#10B981] tabular-nums">
                0 – 10
              </span>
            </div>
            <p className="mt-2.5 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
              Scores the resolution of the segment. Does the clip deliver on the hook with an actionable takeaway, a moment of vulnerability, or a memorable punchline?
            </p>
          </div>

          <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 hover:border-[#383838] transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">4. Topic-Trend Alignment</h3>
              <span className="font-mono rounded-[4px] bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 text-xs font-semibold text-[#10B981] tabular-nums">
                0 – 10
              </span>
            </div>
            <p className="mt-2.5 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
              Measures resonance with current Indian creator topics (startup building, career growth, financial freedom, creator economy, cultural commentary).
            </p>
          </div>
        </div>

        {/* Quality-driven Count vs Fixed-Interval Chunking */}
        <div className="mt-6 rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 hover:border-[#383838] transition-colors">
          <div className="font-mono text-xs uppercase tracking-wider text-[#A1A1A1] mb-1">
            Audio-Signal Fusion
          </div>
          <h3 className="text-base font-semibold text-white">
            Words Are Judged by AI, Moments Are Confirmed by Sound
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
            Text scores alone miss what the room felt. Every candidate also earns up to +8 from the audio itself — laughter and applause peaks, fast excited speech, clean entries after pauses, exits that resolve. No extra API bills: signals are computed locally from your audio and word timings, and they can only ever raise a score, never lower it.
          </p>
        </div>

        {/* Fixed Yield */}
        <div className="mt-6 rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 hover:border-[#383838] transition-colors">
          <div className="font-mono text-xs uppercase tracking-wider text-[#A1A1A1] mb-1">
            Yield Architecture
          </div>
          <h3 className="text-base font-semibold text-white">
            Exactly 10 Clips Per Video, Context-Complete
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
            Regional competitors slice long audio into naive 60-second fixed intervals every 3 minutes. FLOWZORA Clips uses sliding-window sentence alignment with overlap deduplication — and returns the top 10 clips per video regardless of duration. Windows prefer tight 35-second cuts but extend to the next sentence boundary (up to 90 seconds) whenever the thought needs the room, so every clip makes sense on its own.
          </p>
        </div>
      </div>
    </section>
  );
}
