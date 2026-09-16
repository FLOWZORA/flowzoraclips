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
        {/* Hero Section: Functional Tool Front-and-Center (rawtocookedcalculator.com model) */}
        <section className="relative pt-8 pb-16 sm:pt-12 sm:pb-20 px-4 sm:px-6">
          <div className="mx-auto max-w-5xl">
            {/* Tight Header */}
            <div className="text-center max-w-3xl mx-auto mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#FF5722]/30 bg-[#FF5722]/10 px-3 py-1 text-xs font-bold text-[#FF5722] mb-3">
                <span>Specialized for Hindi, Hinglish & English Creators</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-[var(--font-outfit)] leading-tight">
                Turn Long Podcasts into Ranked, Ready-to-Post Short Clips
              </h1>
              <p className="mt-3 text-sm sm:text-base text-[#9AA2B6]">
                No manual scrubbing. Semantic boundary alignment, transparent 4-dimension Gemini scoring, and scene-aware 9:16 vertical reframing.
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
