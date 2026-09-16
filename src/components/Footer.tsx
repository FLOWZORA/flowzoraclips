import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-[#262626] bg-[#000000] py-12 text-xs text-[#707070]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">FLOWZORA Clips</span>
          <span className="text-[#383838]">•</span>
          <span>An AI consulting practice initiative by FLOWZORA</span>
        </div>

        <div className="flex items-center gap-5 text-[#A1A1A1]">
          <Link href="/pricing" className="hover:text-white transition-colors">
            Pricing
          </Link>
          <a href="#scoring" className="hover:text-white transition-colors">
            Scoring Engine
          </a>
          <a href="#accuracy" className="hover:text-white transition-colors">
            Accuracy Benchmark
          </a>
          <span className="font-mono text-[11px] text-[#707070]">© {new Date().getFullYear()} FLOWZORA</span>
        </div>
      </div>
    </footer>
  );
}
