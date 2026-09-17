'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Mail, ArrowLeft, MessageSquare, Shield, CheckCircle2, Clock, Send, AlertCircle, Building2 } from 'lucide-react';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('support');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Simulate support ticket dispatch
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

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
              <Mail className="h-3.5 w-3.5" />
              <span>Creator Support &amp; Legal Inquiries</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-white">
              Contact Us
            </h1>
            <p className="mt-3 text-sm sm:text-base text-[#A1A1A1] max-w-2xl leading-relaxed">
              Have questions about our processing pipeline, need creator support, or want early API access? We are here to help.
            </p>
          </div>

          {/* Grid: Direct Contact Channels & Interactive Form */}
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Direct Channels & SLA */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5">
                <h2 className="text-base font-semibold text-white mb-4">Direct Email Inquiries</h2>
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="font-mono text-[#A1A1A1] uppercase tracking-wider block text-[10px]">
                      General &amp; Creator Support
                    </span>
                    <a
                      href="mailto:support@flowzora.com"
                      className="font-mono text-[#10B981] hover:underline text-sm font-semibold"
                    >
                      support@flowzora.com
                    </a>
                  </div>

                  <div>
                    <span className="font-mono text-[#A1A1A1] uppercase tracking-wider block text-[10px]">
                      API &amp; Agency Partnerships
                    </span>
                    <a
                      href="mailto:api@flowzora.com"
                      className="font-mono text-white hover:underline text-sm font-semibold"
                    >
                      api@flowzora.com
                    </a>
                  </div>

                  <div>
                    <span className="font-mono text-[#A1A1A1] uppercase tracking-wider block text-[10px]">
                      Legal, DMCA &amp; Copyright
                    </span>
                    <a
                      href="mailto:legal@flowzora.com"
                      className="font-mono text-[#A1A1A1] hover:text-white hover:underline text-sm"
                    >
                      legal@flowzora.com
                    </a>
                  </div>

                  <div>
                    <span className="font-mono text-[#A1A1A1] uppercase tracking-wider block text-[10px]">
                      Data Protection &amp; Privacy (GDPR/DPDP)
                    </span>
                    <a
                      href="mailto:privacy@flowzora.com"
                      className="font-mono text-[#A1A1A1] hover:text-white hover:underline text-sm"
                    >
                      privacy@flowzora.com
                    </a>
                  </div>
                </div>
              </div>

              {/* Operating Info & SLA */}
              <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-5 space-y-3 text-xs text-[#A1A1A1]">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Clock className="h-4 w-4 text-[#10B981]" />
                  <span>Response Time Expectation</span>
                </div>
                <p className="leading-relaxed">
                  We review every inbound ticket and typically respond within <strong className="text-white">24 to 48 business hours</strong>.
                </p>
                <div className="pt-2 border-t border-[#262626] flex items-center gap-2 text-[11px]">
                  <Building2 className="h-3.5 w-3.5 text-[#10B981] shrink-0" />
                  <span>FLOWZORA &bull; India &bull; Serving creators worldwide</span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Form */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 sm:p-8 shadow-sm">
                <h2 className="text-lg font-semibold text-white mb-2">Send Us a Message</h2>
                <p className="text-xs text-[#A1A1A1] mb-6">
                  Fill out the form below and our engineering team will get back to you.
                </p>

                {submitted ? (
                  <div className="rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 p-6 text-center animate-in fade-in duration-200">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-[#10B981] mb-3" />
                    <h3 className="text-base font-semibold text-white">Message Received!</h3>
                    <p className="mt-1.5 text-xs text-[#A1A1A1] max-w-md mx-auto leading-relaxed">
                      Thank you for reaching out, <strong className="text-white">{name}</strong>. A confirmation has been logged and our team will reply to <strong className="text-white">{email}</strong> shortly.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitted(false);
                        setMessage('');
                      }}
                      className="mt-5 rounded-lg bg-[#141414] border border-[#262626] hover:bg-[#202020] px-4 py-2 text-xs font-semibold text-white transition-colors"
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#A1A1A1] mb-1.5">
                          Your Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Alex Kumar"
                          className="w-full rounded-lg border border-[#262626] bg-[#111111] px-3.5 py-2 text-xs text-white placeholder-[#666666] focus:border-[#10B981] focus:outline-none min-h-[40px]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#A1A1A1] mb-1.5">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="creator@podcast.com"
                          className="w-full rounded-lg border border-[#262626] bg-[#111111] px-3.5 py-2 text-xs text-white placeholder-[#666666] focus:border-[#10B981] focus:outline-none min-h-[40px]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#A1A1A1] mb-1.5">
                        Inquiry Category *
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-lg border border-[#262626] bg-[#111111] px-3.5 py-2 text-xs text-white focus:border-[#10B981] focus:outline-none min-h-[40px] cursor-pointer"
                      >
                        <option value="support">Creator Support &amp; Pipeline Help</option>
                        <option value="api">API Early Access &amp; Studio Partnerships</option>
                        <option value="feature">Feature Request or Script Feedback</option>
                        <option value="bug">Report a Processing Bug</option>
                        <option value="dmca">DMCA &amp; Copyright Notice</option>
                        <option value="privacy">Privacy &amp; Data Rights</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#A1A1A1] mb-1.5">
                        Message *
                      </label>
                      <textarea
                        required
                        rows={5}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Please describe your question, bug details (including video URL or format), or partnership interest..."
                        className="w-full rounded-lg border border-[#262626] bg-[#111111] px-3.5 py-2.5 text-xs text-white placeholder-[#666666] focus:border-[#10B981] focus:outline-none leading-relaxed"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-white hover:bg-[#E5E5E5] text-black font-semibold text-xs py-2.5 transition-colors disabled:opacity-50 cursor-pointer min-h-[42px]"
                    >
                      {submitting ? (
                        <span>Sending message...</span>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Submit Message</span>
                        </>
                      )}
                    </button>

                    <p className="text-[11px] text-[#707070] text-center pt-1">
                      By submitting this form, you agree to our{' '}
                      <Link href="/privacy" className="text-[#A1A1A1] hover:underline">
                        Privacy Policy
                      </Link>
                      . We will never share or sell your contact information.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
