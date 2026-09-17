import React from 'react';
import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[#262626] bg-[#000000]/80 backdrop-blur-md pt-12 pb-8 text-xs text-[#707070]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Main Footer Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-8 pb-10 border-b border-[#1F1F1F]">
          {/* Brand Column */}
          <div className="md:col-span-5 space-y-3">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-black border border-[#262626] overflow-hidden p-0.5 transition-transform group-hover:scale-105">
                <svg viewBox="0 0 512 512" fill="none" className="h-full w-full">
                  <path d="M 116 148 L 246 256 L 116 364 Z" stroke="#FFFFFF" strokeWidth="52" strokeLinejoin="round" strokeLinecap="round" fill="none" />
                  <path d="M 276 148 L 406 256 L 276 364 Z" stroke="#FFFFFF" strokeWidth="52" strokeLinejoin="round" strokeLinecap="round" fill="none" />
                </svg>
              </div>
              <span className="font-semibold text-sm text-white font-sans">
                flowzora<span className="text-[#A1A1A1] font-normal">clips</span>
              </span>
            </Link>

            <p className="text-xs text-[#A1A1A1] leading-relaxed max-w-sm">
              Turn long podcasts and video recordings into ranked, ready-to-post 9:16 vertical short clips. Genuine Hindi/Hinglish speech accuracy with transparent 4D highlight scoring powered by Google Gemini.
            </p>

            <div className="pt-1 text-[11px] text-[#666666]">
              Operated by <strong>FLOWZORA</strong> &bull; Applied AI consulting &amp; engineering practice.
            </div>
          </div>

          {/* Column 1: Product */}
          <div className="md:col-span-2 space-y-2.5">
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-white font-semibold">
              Product
            </h4>
            <ul className="space-y-2 text-xs text-[#A1A1A1]">
              <li>
                <Link href="/#app" className="hover:text-white transition-colors">
                  Clip Uploader
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="hover:text-white transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/#scoring" className="hover:text-white transition-colors">
                  Scoring Engine
                </Link>
              </li>
              <li>
                <Link href="/#accuracy" className="hover:text-white transition-colors">
                  Acoustic Benchmark
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:text-white transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Legal & Compliance */}
          <div className="md:col-span-3 space-y-2.5">
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-white font-semibold">
              Legal &amp; AdSense
            </h4>
            <ul className="space-y-2 text-xs text-[#A1A1A1]">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="hover:text-white transition-colors">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link href="/terms#dmca" className="hover:text-white transition-colors">
                  DMCA &amp; Copyright
                </Link>
              </li>
              <li>
                <a
                  href="https://adssettings.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#10B981] transition-colors"
                >
                  Ad Choices (Google)
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div className="md:col-span-2 space-y-2.5">
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-white font-semibold">
              Company
            </h4>
            <ul className="space-y-2 text-xs text-[#A1A1A1]">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <a href="mailto:api@flowzora.com" className="hover:text-white transition-colors">
                  Developer API
                </a>
              </li>
              <li>
                <a href="mailto:support@flowzora.com" className="hover:text-white transition-colors">
                  Creator Support
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left text-[11px] text-[#666666]">
          <div>
            &copy; {currentYear} <strong>FLOWZORA</strong> (flowzoraclips.com). All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <span>&bull;</span>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <span>&bull;</span>
            <Link href="/cookies" className="hover:underline">
              Cookies
            </Link>
            <span>&bull;</span>
            <Link href="/contact" className="hover:underline">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
