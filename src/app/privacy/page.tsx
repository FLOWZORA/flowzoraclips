import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ShieldCheck, Lock, Eye, FileText, ArrowLeft, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy — FLOWZORA Clips',
  description:
    'Comprehensive Privacy Policy for FLOWZORA Clips. Transparent disclosure of data handling, cookies, Google AdSense advertising, and creator data protection.',
  alternates: {
    canonical: 'https://flowzoraclips.com/privacy',
  },
};

export default function PrivacyPolicyPage() {
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
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Legal &amp; Compliance</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-white">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-[#A1A1A1]">
              Last Updated: <strong className="text-white font-medium">{lastUpdated}</strong> • Effective immediately for all visitors and registered users.
            </p>
          </div>

          {/* Legal Document Body */}
          <div className="mt-10 space-y-10 text-xs sm:text-sm text-[#D1D5DB] leading-relaxed">
            {/* Section 1: Overview */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                1. Overview &amp; Operating Entity
              </h2>
              <p>
                Welcome to <strong>FLOWZORA Clips</strong> (accessible at{' '}
                <a href="https://flowzoraclips.com" className="text-[#10B981] underline underline-offset-4">
                  https://flowzoraclips.com
                </a>
                ). FLOWZORA Clips is an automated AI-powered video highlight generation and reframing platform developed and operated by <strong>FLOWZORA</strong> (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;), an applied AI consulting and software practice.
              </p>
              <p>
                We are committed to safeguarding the privacy, intellectual property, and personal data of every creator, podcast producer, and visitor who accesses our services. This Privacy Policy details the types of personal data and media we collect, how that information is processed, stored, and protected, and the choices available to you regarding your personal data.
              </p>
            </section>

            {/* Section 2: Google AdSense & Third-Party Advertising Compliance */}
            <section className="space-y-3 rounded-xl border border-[#262626] bg-[#0A0A0A] p-5 sm:p-6">
              <div className="flex items-center gap-2 text-[#10B981]">
                <Eye className="h-4 w-4" />
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                  2. Google AdSense &amp; Third-Party Advertising Disclosures
                </h2>
              </div>
              <p>
                This website may display advertisements served by <strong>Google AdSense</strong> and other third-party advertising networks. In accordance with Google AdSense program policies, please note the following:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-[#A1A1A1]">
                <li>
                  <strong className="text-white">Third-Party Vendors &amp; Cookies:</strong> Third-party vendors, including Google, use cookies to serve advertisements based on a user&rsquo;s prior visits to this website or other websites across the Internet.
                </li>
                <li>
                  <strong className="text-white">Google Advertising (DoubleClick DART) Cookies:</strong> Google&rsquo;s use of advertising cookies enables Google and its partner advertising networks to serve relevant ads to our users based on their navigation and visits to FLOWZORA Clips and other sites on the web.
                </li>
                <li>
                  <strong className="text-white">Opting Out of Personalized Advertising:</strong> Users may opt out of personalized advertising at any time by visiting{' '}
                  <a
                    href="https://adssettings.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#10B981] underline underline-offset-4"
                  >
                    Google Ads Settings (https://adssettings.google.com)
                  </a>
                  . Alternatively, you may opt out of a third-party vendor&rsquo;s use of cookies for personalized advertising by visiting{' '}
                  <a
                    href="https://www.aboutads.info/choices/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#10B981] underline underline-offset-4"
                  >
                    www.aboutads.info/choices/
                  </a>{' '}
                  or the Network Advertising Initiative opt-out page at{' '}
                  <a
                    href="https://optout.networkadvertising.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#10B981] underline underline-offset-4"
                  >
                    networkadvertising.org
                  </a>
                  .
                </li>
                <li>
                  <strong className="text-white">Third-Party Ad Networks:</strong> Third-party ad servers or ad networks employ automated technologies (including cookies, JavaScript, and Web Beacons) in their respective advertisements and embedded links. When these ads appear on our website, they automatically receive your IP address. We do not have access to or control over these cookies used by third-party advertisers.
                </li>
              </ul>
            </section>

            {/* Section 3: Information We Collect */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                3. Information We Collect
              </h2>
              <p>We collect information in three ways: directly from your input, through automated server logs, and via third-party integrations:</p>
              
              <div className="space-y-3 pl-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">A. Information You Provide Directly:</h3>
                  <p className="text-[#A1A1A1] mt-1">
                    - <strong>Creator Account &amp; Authentication:</strong> When accessing creator privileges, we collect your email address to issue secure, passwordless magic links.<br />
                    - <strong>Uploaded Audio/Video Files:</strong> Direct media uploads (MP4, MOV, MP3, WAV) provided for highlight extraction.<br />
                    - <strong>Support &amp; Communications:</strong> Any inquiries, bug reports, or correspondence sent to our support email addresses.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white">B. Automatically Collected Technical Data:</h3>
                  <p className="text-[#A1A1A1] mt-1">
                    When you access FLOWZORA Clips, our servers automatically log technical metadata including: your Internet Protocol (IP) address, browser type and version, language preference, referring URL, operating system, and date/time timestamps. This data is collected strictly for site performance, bot detection, and abuse prevention.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4: How We Process Media & AI Subprocessors */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                4. AI Processing Pipeline &amp; Subprocessors
              </h2>
              <p>
                FLOWZORA Clips processes video timelines to transcribe speech and extract viral candidate clips. We utilize enterprise API endpoints under strict business confidentiality agreements:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-[#A1A1A1]">
                <li>
                  <strong className="text-white">Speech-to-Text Transcription:</strong> We utilize speech recognition engines (including OpenAI Whisper API) to transcribe spoken words into timestamped text.
                </li>
                <li>
                  <strong className="text-white">Highlight Scoring:</strong> Candidate segments are evaluated by <strong>Google Gemini API (Gemini 2.5 Flash / Pro)</strong> across four transparent dimensions (Hook Strength, Standalone Coherence, Emotional Payoff, Topic-Trend Alignment).
                </li>
                <li>
                  <strong className="text-white">Enterprise Privacy Guarantee:</strong> Your uploaded audio and video content is processed solely to fulfill your requested highlight generation. Under enterprise API terms, <strong>your media is never used to train public foundational AI models</strong>.
                </li>
                <li>
                  <strong className="text-white">Storage &amp; Delivery:</strong> Raw source audio and rendered exports are stored in <strong>Cloudflare R2</strong> object storage with zero egress fees and automated expiry cycles.
                </li>
              </ul>
            </section>

            {/* Section 5: Data Retention & Automated Deletion */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                5. Data Retention &amp; Automatic Deletion
              </h2>
              <p>
                We do not retain source footage longer than necessary. Raw uploaded video and audio files stored in Cloudflare R2 are automatically scheduled for permanent deletion within <strong>30 days</strong> of processing, or immediately upon user account deletion request.
              </p>
              <p>
                Derived highlight clips and metadata remain accessible in your account until you choose to download or delete them.
              </p>
            </section>

            {/* Section 6: Cookies & Tracking Policy */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                6. Cookie Management &amp; Opt-Out
              </h2>
              <p>
                We use cookies and browser local storage to maintain user sessions, remember language preferences, and deliver relevant features. For a detailed breakdown of all first-party and third-party advertising cookies, please consult our dedicated{' '}
                <Link href="/cookies" className="text-[#10B981] underline underline-offset-4">
                  Cookie Policy
                </Link>
                .
              </p>
              <p>
                You can configure your browser to refuse all cookies or notify you when a cookie is being sent. However, some features of our interactive studio may not function properly without essential cookies.
              </p>
            </section>

            {/* Section 7: User Rights (GDPR, CCPA & Indian DPDP Act) */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                7. Your Data Protection Rights (GDPR, CCPA, DPDP)
              </h2>
              <p>
                Regardless of your geographic location, FLOWZORA Clips respects your privacy rights:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#A1A1A1]">
                <li><strong className="text-white">The Right to Access:</strong> You have the right to request copies of your personal data held by us.</li>
                <li><strong className="text-white">The Right to Rectification:</strong> You may request corrections to any inaccurate or incomplete information.</li>
                <li><strong className="text-white">The Right to Erasure (Right to be Forgotten):</strong> You may request that we delete all your personal data, uploaded media, and generated clips permanently.</li>
                <li><strong className="text-white">The Right to Restrict or Object to Processing:</strong> You have the right to object to or limit certain processing activities.</li>
                <li><strong className="text-white">The Right to Data Portability:</strong> You may request the transfer of your data in a structured, machine-readable format.</li>
              </ul>
              <p className="mt-2">
                To exercise any of these rights, email our Data Protection team at{' '}
                <a href="mailto:privacy@flowzora.com" className="text-[#10B981] underline underline-offset-4">
                  privacy@flowzora.com
                </a>
                . We respond to all verified requests within 30 days.
              </p>
            </section>

            {/* Section 8: Children's Privacy */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                8. Children&rsquo;s Privacy Protection
              </h2>
              <p>
                FLOWZORA Clips is not directed toward children under the age of 13 (or under 16 in the European Economic Area). We do not knowingly collect personal identifiable information from children. If you believe a child has provided us with personal data, please contact us immediately at{' '}
                <a href="mailto:privacy@flowzora.com" className="text-[#10B981] underline underline-offset-4">
                  privacy@flowzora.com
                </a>{' '}
                and we will promptly remove the information from our records.
              </p>
            </section>

            {/* Section 9: Security */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                9. Security Standards
              </h2>
              <p>
                We employ industry-standard administrative, physical, and technical safeguards to protect your personal data. All data transmission occurs over encrypted HTTPS (TLS 1.3), file uploads utilize time-limited presigned S3 URLs directly to Cloudflare R2, and access to internal databases is restricted via strict role-based access control.
              </p>
            </section>

            {/* Section 10: Contact Us */}
            <section className="space-y-3 border-t border-[#262626] pt-6">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                10. Contact Information
              </h2>
              <p>
                If you have questions, feedback, or concerns regarding this Privacy Policy or our data handling practices, please contact our legal and privacy team:
              </p>
              <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-4 font-mono text-xs text-[#A1A1A1] space-y-1">
                <div><strong>Entity:</strong> FLOWZORA (flowzoraclips.com)</div>
                <div><strong>Privacy Email:</strong> privacy@flowzora.com</div>
                <div><strong>General Inquiries:</strong> support@flowzora.com</div>
                <div><strong>Location:</strong> India &bull; Serving creators worldwide</div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
