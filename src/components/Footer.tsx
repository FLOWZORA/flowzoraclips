import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-[#242938] bg-[#0A0B10] py-10 text-xs text-[#626B82]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white font-[var(--font-outfit)]">FLOWZORA Clips</span>
          <span>•</span>
          <span>An AI product & portfolio initiative by FLOWZORA</span>
        </div>

        <div className="flex items-center gap-4 text-[#9AA2B6]">
          <Link href="/pricing" className="hover:text-white transition-colors">
            Pricing
          </Link>
          <a href="#scoring" className="hover:text-white transition-colors">
            Scoring Engine
          </a>
          <a href="#accuracy" className="hover:text-white transition-colors">
            Accuracy Benchmark
          </a>
          <span>© {new Date().getFullYear()} FLOWZORA</span>
        </div>
      </div>
    </footer>
  );
}
