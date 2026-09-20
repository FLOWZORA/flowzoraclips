'use client';

import React, { useState } from 'react';
import { Upload, Cpu, Video, Sparkles, CheckCircle2, ArrowRight, Layers, FileText, Music } from 'lucide-react';

interface Step {
  id: string;
  number: string;
  title: string;
  tagline: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  details: string[];
  techPill: string;
}

const steps: Step[] = [
  {
    id: 'ingest',
    number: '01',
    title: 'Ingestion & Audio Extraction',
    tagline: 'Direct Cloudflare R2 presigned streaming',
    badge: 'Lossless Audio Ingest',
    icon: Upload,
    description:
      'Drop your long-form podcast or video file (MP4, MOV, MP3, WAV). Our serverless architecture extracts the pristine audio stream and streams high-bitrate media directly to Cloudflare R2 with zero egress fees.',
    details: [
      'Accepts podcast recordings, Zoom interviews, and studio cameras',
      'English audio language with word-level timestamp precision',
      'English animated captions burned directly into the exported clip',
    ],
    techPill: 'Cloudflare R2 • Presigned S3 API • FFmpeg Audio Extract',
  },
  {
    id: 'transcribe',
    number: '02',
    title: 'Word-Level Transcription & Diarization',
    tagline: 'Benchmark-proven English phonetics and filler filtering',
    badge: 'English Speech Engine',
    icon: Music,
    description:
      'The audio is transcribed with millisecond word timestamps and multi-speaker diarization. Speech fillers are automatically indexed for optional trimming to keep clips tight and engaging.',
    details: [
      'Sub-word timestamp synchronization for flawless animated caption alignment',
      'Vocabulary models benchmarked against Whisper, Google Chirp, and AssemblyAI',
      'Automatic flagging of verbal fillers ("um", "uh", "like") for optional trimming',
    ],
    techPill: 'Whisper Large v3 • WER <8.9% • Word Diarization',
  },
  {
    id: 'score',
    number: '03',
    title: 'Semantic Windowing & Gemini 4D Scoring',
    tagline: 'Never naive fixed slices — evaluated across 4 transparent dimensions',
    badge: 'Google Gemini 2.5/3.6 Flash',
    icon: Cpu,
    description:
      'Sliding candidate windows (30–90 seconds) are snapped to natural semantic topic boundaries. Google Gemini evaluates each candidate segment across 4 transparent dimensions, returning strict structured scores and 1-line reasoning text.',
    details: [
      'Hook Strength (0–10): Evaluates whether the opening 3–5 seconds halt user scrolling',
      'Standalone Coherence (0–10): Guarantees the clip makes complete sense without prior context',
      'Emotional Payoff & Trend Alignment (0–10): Evaluates narrative climax and viral resonance',
    ],
    techPill: 'Google Gemini API • Structured JSON Output • Semantic Boundary Snapping',
  },
  {
    id: 'reframe',
    number: '04',
    title: 'Scene-Aware 9:16 Reframe & Export',
    tagline: 'Active speaker tracking with graceful fallback on slides and b-roll',
    badge: 'Hardware Accelerated Render',
    icon: Video,
    description:
      'Active speakers are tracked and kept centered in vertical 9:16 format. If the video cuts to a slide, screen share, or b-roll cutaway, the system gracefully falls back to center-crop or last-good frame without visual jitter.',
    details: [
      'Smart face tracking avoids the "empty chair" glitch common in face-only tools',
      'Word-level karaoke-style animated captions rendered with native font ligatures',
      'Interactive start/end nudge controls (-1s, +1s) and AI social copy generation',
    ],
    techPill: 'FFmpeg Railway Worker • Dual-Script Ligatures • 9:16 / 1:1 / 16:9 Multi-Export',
  },
];

export default function HowItWorks() {
  const [activeStepId, setActiveStepId] = useState<string>('ingest');
  const activeStep = steps.find((s) => s.id === activeStepId) || steps[0];

  return (
    <section
      id="how-it-works"
      className="relative border-t border-[#262626] bg-[#000000]/40 backdrop-blur-[2px] py-16 sm:py-24 scroll-mt-14 overflow-hidden"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-wider text-[#10B981] mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#10B981]" />
            <span>End-to-End Pipeline</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-semibold text-white tracking-[-0.03em] text-balance">
            How FLOWZORA Clips Works
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#A1A1A1] leading-relaxed">
            From raw, unedited 60-minute podcast timelines to ranked, ready-to-post vertical clips with zero manual scrubbing.
          </p>
        </div>

        {/* Interactive Step Toggle Navigation */}
        <div className="mt-10 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 p-1.5 rounded-xl bg-[#0A0A0A] border border-[#262626]">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = step.id === activeStepId;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepId(step.id)}
                className={`min-w-0 sm:flex-1 sm:min-w-[140px] flex items-center justify-start gap-2 rounded-lg px-2.5 sm:px-3.5 py-2.5 text-xs font-medium transition-all cursor-pointer min-h-[44px] ${
                  isActive
                    ? 'bg-[#1C1C1C] text-white shadow-sm border border-[#333333]'
                    : 'text-[#A1A1A1] hover:text-white hover:bg-[#141414]'
                }`}
              >
                <span
                  className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    isActive ? 'bg-[#10B981] text-black font-black' : 'bg-[#1E1E1E] text-[#707070]'
                  }`}
                >
                  {step.number}
                </span>
                <span className="truncate text-left">{step.title.split('&')[0].trim()}</span>
              </button>
            );
          })}
        </div>

        {/* Active Step Showcase Card */}
        <div className="mt-6 rounded-2xl border border-[#262626] bg-[#0A0A0A] p-4 sm:p-8 relative overflow-hidden">
          {/* Subtle Ambient Accent Glow */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-[#10B981]/15 via-[#059669]/10 to-transparent blur-3xl" />

          <div className="flex flex-col lg:flex-row items-start justify-between gap-8">
            {/* Left: Explanation */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 px-2.5 py-0.5 rounded">
                  Step {activeStep.number} • {activeStep.badge}
                </span>
                <span className="hidden sm:inline-block text-xs font-mono text-[#707070]">|</span>
                <span className="hidden sm:inline-block text-xs font-mono text-[#A1A1A1]">
                  {activeStep.techPill}
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                {activeStep.title}
              </h3>
              <p className="mt-2 text-sm text-[#A1A1A1] leading-relaxed">
                {activeStep.description}
              </p>

              {/* Bulleted Key Capabilities */}
              <div className="mt-6 space-y-2.5">
                {activeStep.details.map((detail, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#EDEDED]">
                    <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0 mt-0.5" />
                    <span>{detail}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Visual Card with Quick Action */}
            <div className="w-full lg:w-80 shrink-0 rounded-xl border border-[#262626] bg-[#111111] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
                  <span className="font-mono text-[11px] text-[#A1A1A1]">FLOWZORA PIPELINE</span>
                  <span className="font-mono text-[11px] text-[#10B981] font-semibold">AUTOMATED</span>
                </div>

                <div className="my-4 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between text-[#A1A1A1]">
                    <span>Stage Status:</span>
                    <span className="text-white">Continuous</span>
                  </div>
                  <div className="flex items-center justify-between text-[#A1A1A1]">
                    <span>Engine:</span>
                    <span className="text-white">Gemini 3.6 Flash</span>
                  </div>
                  <div className="flex items-center justify-between text-[#A1A1A1]">
                    <span>Language:</span>
                    <span className="text-[#10B981]">English</span>
                  </div>
                </div>
              </div>

              <a
                href="#app"
                className="mt-4 flex items-center justify-center gap-2 w-full rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#E5E5E5] transition-colors"
              >
                <span>Try In Uploader</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
