import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Cookie, ArrowLeft, ShieldCheck, Settings, ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Cookie Policy — FLOWZORA Clips',
  description:
    'Detailed Cookie Policy for FLOWZORA Clips. Transparent explanations of essential, analytical, and Google AdSense advertising cookies with step-by-step opt-out instructions.',
  alternates: {
    canonical: 'https://flowzoraclips.com/cookies',
  },
};

export default function CookiePolicyPage() {
  const lastUpdated = 'September 17, 2026';

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
              <Cookie className="h-3.5 w-3.5" />
              <span>Cookie Disclosures</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-white">
              Cookie Policy
            </h1>
            <p className="mt-3 text-sm text-[#A1A1A1]">
              Last Updated: <strong className="text-white font-medium">{lastUpdated}</strong> • Clear disclosure of cookies, local storage, and Google AdSense advertising technologies.
            </p>
          </div>

          {/* Document Content */}
          <div className="mt-10 space-y-10 text-xs sm:text-sm text-[#D1D5DB] leading-relaxed">
            {/* Section 1: What Are Cookies */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                1. What Are Cookies and Local Storage?
              </h2>
              <p>
                A cookie is a small text file placed on your computer or mobile device when you visit a website. Cookies allow websites to recognize your device, remember preferences, authenticate sessions, and deliver customized content and advertisements.
              </p>
              <p>
                In addition to standard HTTP cookies, FLOWZORA Clips uses modern browser storage mechanisms such as <strong>HTML5 LocalStorage</strong> to store your interface preferences (such as your chosen script: Devanagari vs. Romanized Latin, and audio language selection: Hindi, Hinglish, or English) without sending repetitive telemetry over the network.
              </p>
            </section>

            {/* Section 2: Categories of Cookies We Use */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                2. Categories of Cookies Used on FLOWZORA Clips
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category A: Essential */}
                <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-[#10B981] font-semibold text-sm mb-2">
                    <ShieldCheck className="h-4 w-4" />
                    <span>A. Essential Technical Cookies</span>
                  </div>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    Strictly necessary for the website to function properly. These cookies handle secure user authentication (magic links), credit ledger session tracking, and CSRF security verification. You cannot disable these cookies without breaking core site functionality.
                  </p>
                </div>

                {/* Category B: Preference */}
                <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-[#10B981] font-semibold text-sm mb-2">
                    <Settings className="h-4 w-4" />
                    <span>B. Functional &amp; Preference Cookies</span>
                  </div>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    Remember your personalized studio settings, such as your chosen caption font script (Devanagari vs. Latin), preferred aspect ratio (9:16 vs. 1:1 vs. 16:9), and playback volume across sessions.
                  </p>
                </div>

                {/* Category C: Analytics */}
                <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-[#10B981] font-semibold text-sm mb-2">
                    <ShieldCheck className="h-4 w-4" />
                    <span>C. Performance &amp; Analytics Cookies</span>
                  </div>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    Collect aggregated, anonymized metrics on how visitors navigate the site, page load speeds, video pipeline latency, and client error logs. This helps us optimize rendering performance and fix pipeline bottlenecks.
                  </p>
                </div>

                {/* Category D: Advertising */}
                <div className="rounded-xl border border-[#10B981]/30 bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm mb-2">
                    <Cookie className="h-4 w-4 text-[#10B981]" />
                    <span>D. Advertising &amp; Google AdSense Cookies</span>
                  </div>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    Served by third-party advertising partners (including Google AdSense). Used to deliver relevant advertisements, cap ad repetition frequency, and measure ad campaign effectiveness across the web.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3: Google AdSense Specific Cookies */}
            <section className="space-y-3 rounded-xl border border-[#262626] bg-[#0A0A0A] p-5 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                3. Google AdSense Advertising &amp; DoubleClick Cookies
              </h2>
              <p>
                As part of our participation in the Google AdSense publisher network:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-[#A1A1A1]">
                <li>
                  <strong className="text-white">Third-Party Serving:</strong> Google and its affiliated advertising partners use cookies to serve ads on FLOWZORA Clips based on your prior visits to this website and other websites across the web.
                </li>
                <li>
                  <strong className="text-white">Interest-Based Ads:</strong> Google&rsquo;s use of advertising cookies enables it and its partners to serve targeted ads based on inferred interests, browsing history, and geographical location.
                </li>
                <li>
                  <strong className="text-white">Opt-Out Rights:</strong> You have the right to disable personalized advertising at any time. Your options for doing so are detailed below.
                </li>
              </ul>
            </section>

            {/* Section 4: How to Opt-Out of Cookies */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                4. How to Manage and Opt-Out of Cookies
              </h2>
              <p>
                You can manage, restrict, or delete cookies at any time through your browser settings or via industry opt-out portals:
              </p>

              <div className="space-y-3 pl-2">
                <div className="rounded-lg border border-[#262626] bg-[#111111] p-4">
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Industry Advertising Opt-Out Portals:
                  </h3>
                  <ul className="space-y-1.5 text-xs text-[#A1A1A1]">
                    <li>
                      &bull;{' '}
                      <a
                        href="https://adssettings.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#10B981] underline inline-flex items-center gap-1"
                      >
                        Google Ads Settings <ExternalLink className="h-3 w-3" />
                      </a>{' '}
                      — Manage Google advertising preferences and personalization.
                    </li>
                    <li>
                      &bull;{' '}
                      <a
                        href="https://www.aboutads.info/choices/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#10B981] underline inline-flex items-center gap-1"
                      >
                        Digital Advertising Alliance (DAA) <ExternalLink className="h-3 w-3" />
                      </a>{' '}
                      — Opt out of participating multi-vendor advertising cookies.
                    </li>
                    <li>
                      &bull;{' '}
                      <a
                        href="https://www.youronlinechoices.eu/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#10B981] underline inline-flex items-center gap-1"
                      >
                        European Interactive Digital Advertising Alliance (EDAA) <ExternalLink className="h-3 w-3" />
                      </a>{' '}
                      — European visitor preferences.
                    </li>
                    <li>
                      &bull;{' '}
                      <a
                        href="https://optout.networkadvertising.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#10B981] underline inline-flex items-center gap-1"
                      >
                        Network Advertising Initiative (NAI) <ExternalLink className="h-3 w-3" />
                      </a>{' '}
                      — Comprehensive consumer ad opt-out.
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Browser-Level Cookie Settings:
                  </h3>
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    Most web browsers allow you to manage cookies via their preference menus. You can instruct your browser to block third-party cookies, alert you before accepting a cookie, or delete all stored cookies upon browser exit:
                  </p>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-[#A1A1A1]">
                    <li><strong className="text-white">Google Chrome:</strong> Settings &gt; Privacy and security &gt; Third-party cookies.</li>
                    <li><strong className="text-white">Apple Safari:</strong> Settings &gt; Privacy &gt; Block all cookies / Prevent cross-site tracking.</li>
                    <li><strong className="text-white">Mozilla Firefox:</strong> Settings &gt; Privacy &amp; Security &gt; Enhanced Tracking Protection.</li>
                    <li><strong className="text-white">Microsoft Edge:</strong> Settings &gt; Cookies and site permissions &gt; Manage and delete cookies.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 5: Updates to Cookie Policy */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                5. Updates to This Cookie Policy
              </h2>
              <p>
                We may periodically update this Cookie Policy to reflect technical changes in the cookies we use or operational requirements under applicable data privacy laws. We encourage you to review this page periodically.
              </p>
            </section>

            {/* Section 6: Contact */}
            <section className="space-y-3 border-t border-[#262626] pt-6">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                6. Questions Regarding Cookies
              </h2>
              <p>
                If you have questions regarding our use of cookies or third-party advertising on FLOWZORA Clips, please contact:
              </p>
              <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-4 font-mono text-xs text-[#A1A1A1] space-y-1">
                <div><strong>Email:</strong> privacy@flowzora.com</div>
                <div><strong>Operator:</strong> FLOWZORA (flowzoraclips.com)</div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
