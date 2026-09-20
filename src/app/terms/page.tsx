import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { FileText, ArrowLeft, Shield, AlertCircle, Scale, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service — FLOWZORA Clips',
  description:
    'Terms of Service and End-User Agreement for FLOWZORA Clips. Transparent rules on creator content ownership, acceptable use, AI output disclaimers, and DMCA policy.',
  alternates: {
    canonical: 'https://flowzoraclips.com/terms',
  },
};

export default function TermsOfServicePage() {
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
              <Scale className="h-3.5 w-3.5" />
              <span>Terms &amp; Conditions</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-white">
              Terms of Service
            </h1>
            <p className="mt-3 text-sm text-[#A1A1A1]">
              Last Updated: <strong className="text-white font-medium">{lastUpdated}</strong> • Please read these terms carefully before accessing FLOWZORA Clips.
            </p>
          </div>

          {/* Legal Document Body */}
          <div className="mt-10 space-y-10 text-xs sm:text-sm text-[#D1D5DB] leading-relaxed">
            {/* Section 1: Agreement to Terms */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                1. Agreement to Terms
              </h2>
              <p>
                These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you (&ldquo;User&rdquo;, &ldquo;Creator&rdquo;, or &ldquo;you&rdquo;) and <strong>FLOWZORA</strong> (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), governing your access to and use of the <strong>FLOWZORA Clips</strong> website (<a href="https://flowzoraclips.com" className="text-[#10B981] underline underline-offset-4">https://flowzoraclips.com</a>), applications, and automated highlight extraction services (collectively, the &ldquo;Service&rdquo;).
              </p>
              <p>
                By accessing or using our Service, you agree that you have read, understood, and agreed to be bound by all of these Terms. If you do not agree with all of these Terms, you are expressly prohibited from using the Service and must discontinue use immediately.
              </p>
            </section>

            {/* Section 2: Creator Content & Intellectual Property Ownership */}
            <section className="space-y-3 rounded-xl border border-[#10B981]/20 bg-[#0A0A0A] p-5 sm:p-6">
              <div className="flex items-center gap-2 text-[#10B981]">
                <CheckCircle2 className="h-4 w-4" />
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                  2. Creator Content Ownership &amp; Intellectual Property
                </h2>
              </div>
              <p>
                <strong className="text-white">You Retain 100% Ownership:</strong> You retain complete and unencumbered ownership, copyright, and all intellectual property rights in and to any audio files, video files, transcripts, or podcast episodes that you submit or upload to the Service (&ldquo;User Content&rdquo;), as well as all resulting video clips, captions, and derived media produced by the Service.
              </p>
              <p>
                <strong className="text-white">Limited Processing License:</strong> By uploading User Content, you grant FLOWZORA a worldwide, non-exclusive, royalty-free, limited license solely to host, ingest, transcribe, analyze, reframe, score, and encode your media as strictly necessary to operate the Service and provide you with your requested clips. This limited license terminates automatically when you delete your files or account.
              </p>
              <p className="text-[#A1A1A1]">
                FLOWZORA does not claim any ownership rights in your videos, podcasts, or exported clips, and will never sell, sublicense, or publicly distribute your raw or edited media without your explicit written authorization.
              </p>
            </section>

            {/* Section 3: Acceptable Use & Prohibited Activities */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                3. Acceptable Use Policy
              </h2>
              <p>
                You represent and warrant that you possess all necessary rights, licenses, and permissions to upload and process any User Content you submit. You agree not to use the Service for any unlawful, infringing, or abusive purposes, including but not limited to:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#A1A1A1]">
                <li>Uploading content that infringes upon the copyright, trademark, patent, trade secret, or privacy rights of any third party.</li>
                <li>Submitting non-consensual deepfakes, deceptive synthetic media intended to mislead or defame, or explicit unauthorized likenesses.</li>
                <li>Uploading hateful, violent, terroristic, sexually explicit, defamatory, or unlawful video or audio recordings.</li>
                <li>Attempting to bypass our rate limits, automated abuse filters, or monthly duration caps via scripted botnets, proxy networks, or disposable emails.</li>
                <li>Reverse engineering, decompiling, or attempting to extract the underlying source code, proprietary boundary snapping algorithms, or scoring logic of FLOWZORA Clips.</li>
                <li>Introducing viruses, trojans, worms, or other malicious code into our Cloudflare R2 infrastructure or Railway rendering workers.</li>
              </ul>
              <p className="text-[#A1A1A1]">
                We reserve the right, without prior notice, to immediately suspend or terminate access for any user who violates this Acceptable Use Policy.
              </p>
            </section>

            {/* Section 4: AI Highlight Scoring & Output Disclaimer */}
            <section className="space-y-3 rounded-xl border border-[#262626] bg-[#0A0A0A] p-5 sm:p-6">
              <div className="flex items-center gap-2 text-[#EDEDED]">
                <AlertCircle className="h-4 w-4 text-[#10B981]" />
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                  4. AI Output Disclaimer &amp; Creator Responsibility
                </h2>
              </div>
              <p>
                FLOWZORA Clips utilizes artificial intelligence and machine learning technologies (including <strong>OpenAI Whisper</strong> for acoustic speech transcription and <strong>Google Gemini API</strong> for semantic highlight scoring). You acknowledge and agree that:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#A1A1A1]">
                <li>AI-generated transcripts, word timestamps, and viral scores are automated algorithmic outputs and may occasionally contain inaccuracies, phonetic misinterpretations, or spelling errors.</li>
                <li>Virality scores (Hook Strength, Standalone Coherence, Emotional Payoff, Trend Alignment) represent algorithmic predictive assessments and do not guarantee specific reach, view counts, or monetization on social media platforms (YouTube, Instagram, TikTok, etc.).</li>
                <li><strong>Creator Review Required:</strong> You are solely responsible for reviewing all generated clips, start/end trim points, and burned-in captions before publishing them to public platforms. FLOWZORA is not liable for any claims arising from content you publicly broadcast.</li>
              </ul>
            </section>

            {/* Section 5: Account Registration & Magic Links */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                5. User Accounts &amp; Authentication
              </h2>
              <p>
                To access extended clip allotments and saved projects, you may authenticate via passwordless email magic link. You agree to provide a valid, accessible email address and are responsible for maintaining control over the email account used to authenticate. You agree to notify us immediately at{' '}
                <a href="mailto:support@flowzora.com" className="text-[#10B981] underline underline-offset-4">
                  support@flowzora.com
                </a>{' '}
                if you suspect unauthorized access to your account.
              </p>
            </section>

            {/* Section 6: Beta Period & Pricing Terms */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                6. Service Availability, Credits &amp; Payments
              </h2>
              <p>
                <strong>Public Beta:</strong> During our public beta, core highlight extraction features and export rendering are provided 100% free of charge up to specified video duration limits. We reserve the right to modify free tier limits, introduce optional top-up credit packs, or establish paid features with advance notice.
              </p>
              <p>
                <strong>No Forced Subscriptions:</strong> Any future paid tiers operate under transparent, pay-as-you-go credit economics without recurring subscription lock-ins or automatic end-of-cycle credit expirations unless explicitly specified.
              </p>
            </section>

            {/* Section 7: DMCA & Copyright Takedown Procedure */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                7. DMCA &amp; Copyright Infringement Takedown Policy
              </h2>
              <p>
                FLOWZORA respects the intellectual property rights of creators and adheres to the safe harbor provisions of the Digital Millennium Copyright Act (17 U.S.C. &sect; 512) and applicable Indian Copyright Law. If you believe your copyrighted work has been uploaded or processed through our Service without authorization, please send a written notification to our Designated Copyright Agent at{' '}
                <a href="mailto:legal@flowzora.com" className="text-[#10B981] underline underline-offset-4">
                  legal@flowzora.com
                </a>{' '}
                containing:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2 text-[#A1A1A1]">
                <li>Physical or electronic signature of the copyright owner or authorized representative.</li>
                <li>Identification of the copyrighted work claimed to have been infringed.</li>
                <li>Identification of the material on our service that is claimed to be infringing (including URLs or job identifiers).</li>
                <li>Your contact information (full legal name, address, telephone number, and email address).</li>
                <li>A statement that you have a good-faith belief that use of the material is not authorized by the copyright owner.</li>
                <li>A statement made under penalty of perjury that the information in the notification is accurate.</li>
              </ul>
            </section>

            {/* Section 8: Limitation of Liability */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                8. Disclaimer of Warranties &amp; Limitation of Liability
              </h2>
              <p>
                THE SERVICE IS PROVIDED ON AN &ldquo;AS-IS&rdquo; AND &ldquo;AS-AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY LAW, FLOWZORA DISCLAIMS ALL WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p>
                IN NO EVENT SHALL FLOWZORA, ITS DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, CONSEQUENTIAL, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF DATA, REVENUE, PROFITS, OR GOODWILL) ARISING OUT OF YOUR ACCESS OR INABILITY TO ACCESS THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
            </section>

            {/* Section 9: Governing Law & Jurisdiction */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                9. Governing Law &amp; Dispute Resolution
              </h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the Republic of India, without regard to its conflict of law principles. Any dispute, claim, or controversy arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the competent courts located in India.
              </p>
            </section>

            {/* Section 10: Modifications & Contact */}
            <section className="space-y-3 border-t border-[#262626] pt-6">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
                10. Changes to Terms &amp; Legal Inquiries
              </h2>
              <p>
                We reserve the right to revise these Terms at any time. When modifications are made, we will update the &ldquo;Last Updated&rdquo; date at the top of this document. Continued use of the Service following published updates constitutes your acceptance of the revised Terms.
              </p>
              <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-4 font-mono text-xs text-[#A1A1A1] space-y-1">
                <div><strong>Entity:</strong> FLOWZORA (flowzoraclips.com)</div>
                <div><strong>Legal Counsel:</strong> legal@flowzora.com</div>
                <div><strong>Support:</strong> support@flowzora.com</div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
