import React from 'react';

export default function FaqSection() {
  const faqs = [
    {
      question: 'How does FLOWZORA Clips work?',
      answer:
        'You simply paste a YouTube URL or drop a long-form video file (MP4, MOV, MP3, WAV). Our pipeline transcribes audio with word-level timestamps, detects natural semantic sentence boundaries (never naive fixed time slices), scores candidate moments across 4 dimensions (Hook, Coherence, Emotion, Trend) using Google Gemini, and reframes the best moments into 9:16 vertical clips with animated bilingual captions.',
    },
    {
      question: 'What kind of videos are supported?',
      answer:
        'Podcasts, interview shows, educational talks, webinars, tutorials, commentaries, tech discussions, stand-up comedy, and conversational video formats. We support direct YouTube URLs as well as direct file uploads in MP4, MOV, MP3, and WAV up to 60 minutes long during our free beta.',
    },
    {
      question: 'What languages are supported?',
      answer:
        'We specialize deeply in Hindi, code-switched Hinglish (mixed Hindi + English), and English. Our transcription engine is benchmarked against Whisper, Google Cloud Speech (Chirp), and AssemblyAI to preserve colloquial Hindi/Hinglish vocabulary, with bilingual caption rendering in both native Devanagari (देवनागरी) and Romanized Latin scripts.',
    },
    {
      question: 'Is FLOWZORA Clips free?',
      answer:
        'Yes! FLOWZORA Clips is currently 100% free with unlimited clips during our public beta. No credit card, payment details, or forced recurring subscriptions are required.',
    },
    {
      question: 'Is FLOWZORA Clips really cheaper than Opus Clip?',
      answer:
        'Yes. FLOWZORA Clips is currently completely free during public beta. Furthermore, our pricing philosophy is built on transparent pay-as-you-go top-ups rather than Opus Clip’s aggressive monthly recurring subscriptions. You will never lose unused credits at the end of a billing cycle.',
    },
    {
      question: 'Does FLOWZORA Clips have a public API like Opus Clip?',
      answer:
        'Yes! Our processing pipeline is engineered API-first. Programmatic REST API access and webhook events for podcast networks, content agencies, and automated creator workflows are currently in developer preview. Contact api@flowzora.com for early API access.',
    },
    {
      question: 'Can FLOWZORA Clips reframe non-talking-head videos?',
      answer:
        'Yes! Unlike face-only reframing tools that freak out or snap to empty chairs when no face is visible, FLOWZORA Clips implements scene-aware reframing with a graceful fallback to center-crop or last-known-good frame, preventing visual glitches on slides, b-roll, screenshares, and cutaways.',
    },
    {
      question: 'Can I import my own footage and B-roll in FLOWZORA Clips?',
      answer:
        'Yes. You can upload multi-track files, raw studio cuts, or edited timelines directly via Cloudflare R2 presigned uploads or via YouTube. Our scene-change detector respects your visual cutaways and b-roll pacing while keeping active speakers dynamically centered.',
    },
    {
      question: 'Why is the scoring model more transparent than other clip tools?',
      answer:
        'Competitors provide a single opaque "virality score" (e.g. "87%"). FLOWZORA Clips uses Google Gemini to evaluate each candidate segment across 4 transparent dimensions: Hook Strength (0–10), Standalone Coherence (0–10), Emotional Payoff (0–10), and Topic-Trend Alignment (0–10), complete with a one-line reasoning explanation explaining exactly why each clip works.',
    },
  ];

  return (
    <section id="faq" className="border-t border-[#262626] bg-[#000000] py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="font-mono text-xs uppercase tracking-wider text-[#A1A1A1] mb-2">
          Knowledge Base
        </div>
        <h2 className="text-2xl sm:text-4xl font-semibold text-white tracking-[-0.03em]">
          Frequently Asked Questions
        </h2>

        <div className="mt-10 divide-y divide-[#262626]">
          {faqs.map((faq, index) => (
            <div key={index} className="py-6">
              <h3 className="text-base font-semibold text-white">
                {faq.question}
              </h3>
              <p className="mt-2.5 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
