import React from 'react';
import Navbar from '@/components/Navbar';
import HeroUploader from '@/components/HeroUploader';
import HowItWorks from '@/components/HowItWorks';
import ScoringExplainer from '@/components/ScoringExplainer';
import HindiBenchmarkCallout from '@/components/HindiBenchmarkCallout';
// import PricingTable from '@/components/PricingTable';
import FaqSection from '@/components/FaqSection';
import Footer from '@/components/Footer';

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main className="flex-1">
        {/* Hero Section: Functional Tool Front-and-Center */}
        <section className="relative pt-6 pb-12 sm:pt-16 sm:pb-24 px-3 sm:px-6">

          <div className="mx-auto max-w-5xl">
            {/* Header */}
            <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#262626] bg-[#0A0A0A] px-3.5 py-1 text-xs font-mono text-[#A1A1A1] mb-4 sm:mb-5 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                <span>Gemini 3.6 Flash &bull; Hindi &amp; Hinglish Engine</span>
              </div>
              <h1 className="text-2xl xs:text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.04em] text-white leading-[1.15] sm:leading-[1.1] text-balance">
                Turn Long Podcasts into Ranked, Ready-to-Post Short Clips
              </h1>
              <p className="mt-3 sm:mt-4 text-xs sm:text-base text-[#A1A1A1] max-w-2xl mx-auto font-normal leading-relaxed text-balance">
                No manual scrubbing. Semantic boundary alignment, transparent 4-dimension scoring, and scene-aware 9:16 vertical reframing.
              </p>
            </div>

            {/* The Hero Tool Widget */}
            <HeroUploader />
          </div>
        </section>

        {/* Interactive Step-by-Step Pipeline Explainer */}
        <HowItWorks />

        {/* Transparent Scoring Breakdown */}
        <ScoringExplainer />

        {/* Hindi/Hinglish Accuracy & Scene-Aware Reframe Callout */}
        <HindiBenchmarkCallout />

        {/* Pricing temporarily disabled for 100% free beta period */}
        {/* <PricingTable /> */}

        {/* Citation-Backed FAQ */}
        <FaqSection />
      </main>

      <Footer />
    </>
  );
}
