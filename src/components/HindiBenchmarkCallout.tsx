import React from 'react';

export default function HindiBenchmarkCallout() {
  return (
    <section id="accuracy" className="border-t border-[#242938] bg-[#141620] py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-[var(--font-outfit)]">
            Built for Real Hindi & Hinglish Speech
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#9AA2B6] leading-relaxed">
            Code-switched Hindi-English speech experiences a <strong>30% to 50% relative Word Error Rate (WER) increase</strong> on standard monolingual speech engines. Generic clipping tools butcher colloquial Hindi phrases or fail on English terminology embedded in Hindi sentence structures.
          </p>
        </div>

        {/* Comparative Columns */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Problem */}
          <div className="rounded-xl border border-[#2B3040] bg-[#0A0B10] p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#EF4444]">
              Where Generic Tools Break Down
            </div>
            <ul className="mt-4 space-y-3 text-xs text-[#9AA2B6]">
              <li className="flex items-start gap-2">
                <span className="text-[#EF4444] font-bold">✕</span>
                <span>
                  <strong>Code-switching corruption:</strong> English loan-words ("metrics", "burnout", "retention") get mangled when surrounded by Hindi auxiliary verbs.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#EF4444] font-bold">✕</span>
                <span>
                  <strong>Face-only reframing breaks:</strong> Tools like Vizard.ai track only faces; when a podcast cuts to a screen share, slides, or b-roll, the camera violently jumps or clips blank space.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#EF4444] font-bold">✕</span>
                <span>
                  <strong>Broken Devanagari ligatures:</strong> Captions fail to render half-letters (halant/samyuktakshar) properly, yielding unprofessional illegible captions.
                </span>
              </li>
            </ul>
          </div>

          {/* Solution */}
          <div className="rounded-xl border border-[#2B3040] bg-[#0A0B10] p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#10B981]">
              The FLOWZORA Clips Standard
            </div>
            <ul className="mt-4 space-y-3 text-xs text-[#9AA2B6]">
              <li className="flex items-start gap-2">
                <span className="text-[#10B981] font-bold">✓</span>
                <span>
                  <strong>Whisper + Gemini phonetic alignment:</strong> Tested and validated against real Hindi/Hinglish podcast audio to retain exact conversational syntax.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#10B981] font-bold">✓</span>
                <span>
                  <strong>Scene-aware 9:16 reframe:</strong> Active speaker detection with seamless fallback to center-crop or last-known-good frame during presentation slides and cutaways.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#10B981] font-bold">✓</span>
                <span>
                  <strong>Dual-script choice:</strong> Choose between native Devanagari (देवनागरी) or Romanized Latin Hinglish captions, with full ligature and typography support.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
