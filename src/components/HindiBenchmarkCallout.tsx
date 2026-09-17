import React from 'react';

export default function HindiBenchmarkCallout() {
  return (
    <section id="accuracy" className="relative border-t border-[#262626] bg-[#000000]/40 backdrop-blur-[2px] py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-wider text-[#A1A1A1] mb-2">
            Acoustic & Linguistic Benchmark
          </div>
          <h2 className="text-2xl sm:text-4xl font-semibold text-white tracking-[-0.03em] text-balance">
            Engineered for Real Hindi &amp; Hinglish Speech
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#A1A1A1] leading-relaxed">
            Code-switched Hindi-English speech suffers a <strong className="text-white">30% to 50% relative Word Error Rate (WER) increase</strong> on standard monolingual speech engines. Generic clipping tools butcher colloquial Hindi phrases or stumble on English terminology embedded in Hindi syntax.
          </p>
        </div>

        {/* Comparative Columns */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Problem */}
          <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 hover:border-[#383838] transition-colors">
            <div className="font-mono text-xs uppercase tracking-wider text-[#EF4444] mb-4">
              Where Generic Tools Break Down
            </div>
            <ul className="space-y-3.5 text-xs sm:text-sm text-[#A1A1A1]">
              <li className="flex items-start gap-2.5">
                <span className="text-[#EF4444] font-mono font-bold">✕</span>
                <span>
                  <strong className="text-white">Code-switching corruption:</strong> English loan-words (“metrics”, “burnout”, “retention”) get mangled when surrounded by Hindi auxiliary verbs.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-[#EF4444] font-mono font-bold">✕</span>
                <span>
                  <strong className="text-white">Face-only reframing breaks:</strong> Tools that track only faces violently jump or clip blank space when a video switches to slides, screen shares, or cutaway b-roll.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-[#EF4444] font-mono font-bold">✕</span>
                <span>
                  <strong className="text-white">Broken Devanagari ligatures:</strong> Captions fail to render half-letters (halant/samyuktakshar) properly, yielding unprofessional illegible text.
                </span>
              </li>
            </ul>
          </div>

          {/* Solution */}
          <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 hover:border-[#383838] transition-colors">
            <div className="font-mono text-xs uppercase tracking-wider text-[#10B981] mb-4">
              The FLOWZORA Clips Standard
            </div>
            <ul className="space-y-3.5 text-xs sm:text-sm text-[#A1A1A1]">
              <li className="flex items-start gap-2.5">
                <span className="text-[#10B981] font-mono font-bold">✓</span>
                <span>
                  <strong className="text-white">Whisper + Gemini phonetic alignment:</strong> Tested and validated against real Hindi/Hinglish podcast audio to retain exact conversational syntax.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-[#10B981] font-mono font-bold">✓</span>
                <span>
                  <strong className="text-white">Scene-aware 9:16 reframe:</strong> Active speaker detection with seamless fallback to center-crop or last-known-good frame during presentation slides and cutaways.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-[#10B981] font-mono font-bold">✓</span>
                <span>
                  <strong className="text-white">Dual-script choice:</strong> Choose between native Devanagari (देवनागरी) or Romanized Latin Hinglish captions, with full ligature and typography support.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
