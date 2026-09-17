import React from 'react';

export default function Footer() {
  return (
    <footer className="border-t border-[#262626] bg-[#000000] py-12 text-xs text-[#707070]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-black border border-[#262626] overflow-hidden p-0.5">
            <svg viewBox="0 0 512 512" fill="none" className="h-full w-full">
              <path d="M 116 148 L 246 256 L 116 364 Z" stroke="#FFFFFF" strokeWidth="52" strokeLinejoin="round" strokeLinecap="round" fill="none" />
              <path d="M 276 148 L 406 256 L 276 364 Z" stroke="#FFFFFF" strokeWidth="52" strokeLinejoin="round" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <span className="font-semibold text-white">flowzora<span className="text-[#A1A1A1] font-normal">clips</span></span>
          <span className="text-[#383838]">•</span>
          <span>An AI consulting practice initiative by FLOWZORA</span>
        </div>

        <div className="flex items-center gap-5 text-[#A1A1A1]">
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
