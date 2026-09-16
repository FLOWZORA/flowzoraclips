import React from 'react';

export default function FaqSection() {
  return (
    <section className="border-t border-[#242938] bg-[#141620] py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-[var(--font-outfit)]">
          Frequently Asked Questions
        </h2>

        <div className="mt-8 divide-y divide-[#242938]">
          <div className="py-5">
            <h3 className="text-sm font-bold text-white">
              How does FLOWZORA Clips handle mixed Hindi and English (Hinglish)?
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-[#9AA2B6] leading-relaxed">
              Standard ASR systems experience high word-error spikes when English nouns and verbs appear within Hindi sentence structure (see code-switched WER benchmarks cited in our documentation). We benchmark Whisper against Google Chirp and AssemblyAI to preserve exact bilingual phonetics, allowing you to export captions in either native Devanagari (देवनागरी) script or clean Romanized Latin script.
            </p>
          </div>

          <div className="py-5">
            <h3 className="text-sm font-bold text-white">
              Why is the scoring model more transparent than other clip tools?
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-[#9AA2B6] leading-relaxed">
              Competitors provide a single opaque "virality score" (e.g. "87%"). FLOWZORA Clips uses Google Gemini to evaluate each candidate segment across 4 transparent dimensions: Hook Strength (0–10), Standalone Coherence (0–10), Emotional Payoff (0–10), and Topic-Trend Alignment (0–10), plus a one-line reasoning explanation explaining why the clip works.
            </p>
          </div>

          <div className="py-5">
            <h3 className="text-sm font-bold text-white">
              What happens during cutaways, slides, or screenshares?
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-[#9AA2B6] leading-relaxed">
              Unlike face-only reframing tools that freak out or center on empty chairs when no face is visible, FLOWZORA Clips implements scene-aware reframing with a graceful fallback to center-crop or last-known-good frame, preventing visual glitches on slides or b-roll.
            </p>
          </div>

          <div className="py-5">
            <h3 className="text-sm font-bold text-white">
              Is the free tier really recurring every month?
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-[#9AA2B6] leading-relaxed">
              Yes. You get 2 videos per month (up to 10 minutes each) every month with no credit card required. If you need more volume, you can buy a one-time Creator Top-Up pack ($12 for 10 videos) without getting locked into a recurring subscription.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
