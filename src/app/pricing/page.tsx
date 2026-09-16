import type { Metadata } from 'next';
import React from 'react';
import Navbar from '@/components/Navbar';
import PricingTable from '@/components/PricingTable';
import FaqSection from '@/components/FaqSection';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Pricing — FLOWZORA Clips | Permanent Free Monthly Tier & Creator Top-Ups',
  description:
    'Simple, crawlable pricing for FLOWZORA Clips. Free tier includes 2 videos/month (up to 10 min each). Creator Top-Up is $12 for 10 videos with no recurring subscription required.',
  openGraph: {
    title: 'Pricing — FLOWZORA Clips',
    description:
      'Permanent free monthly tier (2 videos/mo) + pay-per-video top-ups. Zero forced subscriptions.',
    url: 'https://flowzoraclips.com/pricing',
  },
};

export default function PricingPage() {
  return (
    <>
      <Navbar />

      <main className="flex-1">
        <div className="pt-8 pb-4 text-center px-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white font-[var(--font-outfit)]">
            FLOWZORA Clips Plans & Pricing
          </h1>
          <p className="mt-2 text-sm text-[#9AA2B6]">
            Permanent free monthly allotment. Pay-as-you-go top-ups. Zero forced subscriptions.
          </p>
        </div>

        {/* Crawlable plain HTML pricing table component */}
        <PricingTable />

        <FaqSection />
      </main>

      <Footer />
    </>
  );
}
