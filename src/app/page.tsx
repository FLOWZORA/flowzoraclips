import React from 'react';
import Navbar from '@/components/Navbar';
import HeroUploader from '@/components/HeroUploader';
import ScoringExplainer from '@/components/ScoringExplainer';
import HindiBenchmarkCallout from '@/components/HindiBenchmarkCallout';
import PricingTable from '@/components/PricingTable';
import FaqSection from '@/components/FaqSection';
import Footer from '@/components/Footer';

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main className="flex-1">
        {/* Hero Section: Functional Tool Front-and-Center with Vercel Mesh Gradient */}
        <section className="relative pt-10 pb-16 sm:pt-16 sm:pb-24 px-4 sm:px-6 overflow-hidden">
          {/* Vercel Ambient Mesh Gradient */}
          <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
            <div className="h-[420px] w-[650px] -translate-y-20 rounded-full bg-gradient-to-tr from-[#FF5722]/15 via-[#7928CA]/10 to-[#00DFD8]/10 blur-[120px]" />
          </div>

          <div className="mx-auto max-w-5xl">
            {/* Header */}
            <div className="text-center max-w-3xl mx-auto mb-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#262626] bg-[#0A0A0A] px-3.5 py-1 text-xs font-mono text-[#A1A1A1] mb-5 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF5722] animate-pulse" />
                <span>Gemini 3.6 Flash &bull; Hindi &amp; Hinglish Engine</span>
              </div>
              <h1 className="text-3xl sm:text-6xl font-semibold tracking-[-0.04em] text-white leading-[1.1] text-balance">
                Turn Long Podcasts into Ranked, Ready-to-Post Short Clips
              </h1>
              <p className="mt-4 text-sm sm:text-base text-[#A1A1A1] max-w-2xl mx-auto font-normal leading-relaxed text-balance">
                No manual scrubbing. Semantic boundary alignment, transparent 4-dimension scoring, and scene-aware 9:16 vertical reframing.
              </p>
            </div>

            {/* The Hero Tool Widget */}
            <HeroUploader />
          </div>
        </section>

        {/* Transparent Scoring Breakdown */}
        <ScoringExplainer />

        {/* Hindi/Hinglish Accuracy & Scene-Aware Reframe Callout */}
        <HindiBenchmarkCallout />

        {/* Server-Rendered Plain-HTML Crawlable Pricing */}
        <PricingTable />

        {/* Citation-Backed FAQ */}
        <FaqSection />
      </main>

      <Footer />
    </>
  );
}
