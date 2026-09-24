import React from 'react';

export default function FaqSection() {
  const faqs = [
    {
      question: 'How does FLOWZORA Clips work?',
      answer:
        'You simply drop a long-form video or audio file (MP4, MOV, MP3, WAV). Our pipeline transcribes audio with word-level timestamps using Cloudflare Whisper Turbo (with automatic Groq backup), detects natural semantic sentence boundaries (never naive fixed time slices), scores candidate moments across 4 dimensions (Hook, Coherence, Emotion, Trend) using Google Gemini backed by audio-signal evidence, and reframes the best 10 moments into vertical clips with animated captions.',
    },
    {
      question: 'What kind of videos are supported?',
      answer:
        'Podcasts, interview shows, educational talks, webinars, tutorials, commentaries, tech discussions, stand-up comedy, and conversational video formats. We support direct file uploads in MP4, MOV, MP3, and WAV during our free beta.',
    },
    {
      question: 'What languages are supported?',
      answer:
        'We support English-language content including podcasts, interviews, talks, and commentary videos. Our transcription engine is benchmarked against Whisper, Google Cloud Speech (Chirp), and AssemblyAI to deliver accurate English captions with word-level timestamp precision.',
    },
    {
      question: 'Is FLOWZORA Clips free?',
      answer:
        'Yes! FLOWZORA Clips is currently 100% free during our public beta — 10 ranked clips per video, no credit card, payment details, or forced recurring subscriptions required.',
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
        'Yes. You can upload multi-track files, raw studio cuts, or edited timelines directly via Cloudflare R2 presigned uploads. Our scene-change detector respects your visual cutaways and b-roll pacing while keeping active speakers dynamically centered.',
    },
    {
      question: 'Why is the scoring model more transparent than other clip tools?',
      answer:
        'Competitors provide a single opaque "virality score" (e.g. "87%"). FLOWZORA Clips uses Google Gemini to evaluate each candidate segment across 4 transparent dimensions: Hook Strength (0–10), Standalone Coherence (0–10), Emotional Payoff (0–10), and Topic-Trend Alignment (0–10), complete with a one-line reasoning explanation explaining exactly why each clip works. Audio signals (energy peaks, excitement bursts) add up to +8 on top, and every boost is labeled in the reasoning.',
    },
    {
      question: 'How many clips do I get per video?',
      answer:
        'Exactly 10 — regardless of whether your video is 10 minutes or 3 hours. Candidates are deduped for overlap, ranked best-first, and the top 10 survive. Short videos with fewer strong moments may return fewer rather than filler.',
    },
    {
      question: 'How long is each clip?',
      answer:
        'Between 15 and 90 seconds. Cuts prefer tight 35-second endings but extend to the next sentence boundary (up to 90 seconds) whenever the thought needs more context — so clips always end on a resolved point, never mid-sentence.',
    },
    {
      question: 'What happens when a free API quota runs out?',
      answer:
        'The pipeline fails over automatically: Cloudflare Whisper hands off to Groq Whisper for transcription, and Gemini scoring hands off to Groq LLM — Groq is never used first, only as backup. The estimated daily quota panel above the How It Works section shows how much headroom each API has left, resetting at midnight Pacific.',
    },
  ];

  return (
    <section id="faq" className="relative border-t border-[#262626] bg-[#000000]/40 backdrop-blur-[2px] py-16 sm:py-24">
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
