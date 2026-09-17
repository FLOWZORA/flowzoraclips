import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Sparkles, ArrowLeft, Cpu, Globe, Users, Shield, Target, Award } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Us — FLOWZORA Clips',
  description:
    'Learn about FLOWZORA Clips, our mission to empower bilingual Hindi, Hinglish, and English creators with genuine transcription accuracy and transparent AI highlight ranking.',
  alternates: {
    canonical: 'https://flowzoraclips.com/about',
  },
};

export default function AboutPage() {
  return (
    <>
      <Navbar />

      <main className="flex-1 py-12 sm:py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          {/* Breadcrumb & Back */}
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-[#A1A1A1] hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Clips Tool</span>
            </Link>
          </div>

          {/* Page Header */}
          <div className="border-b border-[#262626] pb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3.5 py-1 text-xs font-mono text-[#10B981] mb-4">
              <Users className="h-3.5 w-3.5" />
              <span>Publisher &amp; Company Overview</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-white">
              About FLOWZORA Clips
            </h1>
            <p className="mt-3 text-sm sm:text-base text-[#A1A1A1] max-w-2xl leading-relaxed">
              We build intelligent media engineering tools that turn long-form podcasts and talk shows into ranked, ready-to-post vertical short clips without manual scrubbing.
            </p>
          </div>

          {/* Document Content */}
          <div className="mt-10 space-y-12 text-xs sm:text-sm text-[#D1D5DB] leading-relaxed">
            {/* Section 1: The Problem & Origin */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                Our Mission &amp; Origin
              </h2>
              <p>
                <strong>FLOWZORA Clips</strong> is an applied product initiative by <strong>FLOWZORA</strong>, an artificial intelligence consulting and systems engineering practice based in India.
              </p>
              <p>
                As podcasting exploded across India and global bilingual diaspora communities, solo creators, talk-show producers, and startup founders faced an acute bottleneck: existing automated video clipping platforms were engineered predominantly for monolingual English content.
              </p>
              <p>
                When fed genuine Hindi or code-switched Hinglish conversations, generic tools suffered from:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#A1A1A1]">
                <li><strong className="text-white">Acoustic &amp; Vocabulary Breakdowns:</strong> 30% to 50% Word Error Rate (WER) spikes on colloquial code-switched phrasing, resulting in phonetic gibberish.</li>
                <li><strong className="text-white">Naive Fixed-Interval Cuts:</strong> Regional tools slicing audio at arbitrary 60-second timer intervals (0:00–1:00, 1:00–2:00) rather than respecting natural semantic sentence or topic boundaries.</li>
                <li><strong className="text-white">Face-Only Reframing Glitches:</strong> Tools that snap violently to empty chairs or jitter uncomfortably when guests switch to presentation slides or screen shares.</li>
                <li><strong className="text-white">Broken Devanagari Typography:</strong> Font rendering engines that butcher native Hindi halant and conjunct ligatures (संयुक्ताक्षर).</li>
              </ul>
              <p>
                We built FLOWZORA Clips from the ground up to solve these exact acoustic, semantic, and computer vision challenges.
              </p>
            </section>

            {/* Section 2: Core Engineering Pillars */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                Our Four Core Architectural Pillars
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-[#10B981] font-semibold text-sm mb-2">
                    <Target className="h-4 w-4" />
                    <span>1. Semantic Boundary Snapping</span>
                  </div>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    We never cut audio on a rigid clock timer. Sliding candidate windows (30–90s) are snapped dynamically to conversational pauses and complete grammatical sentences so thoughts are never clipped mid-word.
                  </p>
                </div>

                <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-[#10B981] font-semibold text-sm mb-2">
                    <Cpu className="h-4 w-4" />
                    <span>2. Transparent Gemini Scoring</span>
                  </div>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    Rather than an opaque &ldquo;89% Viral&rdquo; score, Google Gemini 2.5 Flash evaluates clips across four structured dimensions: Hook Strength, Standalone Coherence, Emotional Payoff, and Topic Trend Alignment, complete with a transparent reasoning breakdown.
                  </p>
                </div>

                <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-[#10B981] font-semibold text-sm mb-2">
                    <Globe className="h-4 w-4" />
                    <span>3. Bilingual Phonetic Accuracy</span>
                  </div>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    Deeply benchmarked against real Hindi and Hinglish podcast audio to retain exact conversational syntax, with dual-script export choices in native Devanagari (देवनागरी) and clean Romanized Latin script.
                  </p>
                </div>

                <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-[#10B981] font-semibold text-sm mb-2">
                    <Shield className="h-4 w-4" />
                    <span>4. Scene-Aware 9:16 Reframe</span>
                  </div>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    Active speakers are tracked smoothly into 9:16 vertical video. When presentations, screenshares, or B-roll cutaways occur, our system gracefully falls back to center-crop without visual jitter.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3: Editorial Quality & Fighting AI Slop */}
            <section className="space-y-3 rounded-xl border border-[#262626] bg-[#0A0A0A] p-5 sm:p-6">
              <div className="flex items-center gap-2 text-white font-semibold text-base">
                <Award className="h-4 w-4 text-[#10B981]" />
                <span>Our Editorial Stance: Quality Over Artificial Quotas</span>
              </div>
              <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
                The internet does not need more low-effort &ldquo;AI slop&rdquo; flooding social media algorithms. A typical 45-minute podcast might genuinely contain only 6–8 truly viral, high-coherence moments.
              </p>
              <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
                Unlike competitors who enforce artificial quotas (e.g. churning out 30 low-quality snippets just to inflate numbers), FLOWZORA Clips implements strict quality-gating and overlap deduplication. We deliver only the highlights that meet rigorous standalone coherence standards, saving creators dozens of hours of manual review.
              </p>
            </section>

            {/* Section 4: Operating Entity & Contact */}
            <section className="space-y-3 border-t border-[#262626] pt-6">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                Company Information &amp; Connect With Us
              </h2>
              <p>
                FLOWZORA Clips is owned and operated by <strong>FLOWZORA</strong>. We welcome partnerships with podcast networks, YouTube creators, content marketing agencies, and media developers.
              </p>
              <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5 space-y-2 font-mono text-xs text-[#A1A1A1]">
                <div><strong>Brand:</strong> FLOWZORA Clips (flowzoraclips.com)</div>
                <div><strong>Parent Practice:</strong> FLOWZORA (AI consulting &amp; engineering)</div>
                <div><strong>General Support:</strong> support@flowzora.com</div>
                <div><strong>Partnerships &amp; API:</strong> api@flowzora.com</div>
                <div><strong>Legal &amp; DMCA:</strong> legal@flowzora.com</div>
                <div><strong>Headquarters:</strong> India &bull; Serving creators and studios globally</div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
