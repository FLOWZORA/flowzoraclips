import React from 'react';
import Link from 'next/link';
import CheckoutButton from './CheckoutButton';

export default function PricingTable() {
  return (
    <section id="pricing" className="border-t border-[#262626] bg-[#000000] py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto">
          <div className="font-mono text-xs uppercase tracking-wider text-[#A1A1A1] mb-2">
            Fair Pay-As-You-Go Economics
          </div>
          <h2 className="text-2xl sm:text-4xl font-semibold text-white tracking-[-0.03em] text-balance">
            Transparent Pricing Without Forced Subscriptions
          </h2>
          <p className="mt-3 text-sm text-[#A1A1A1] text-balance">
            A permanent recurring free monthly allowance for solo creators, plus straightforward pay-per-video top-ups when you have more content to clip.
          </p>
        </div>

        {/* Crawlable Plain-HTML Pricing Grid (Rule B: Pure React Server Component with client checkout triggers) */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Free Tier Card */}
          <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 flex flex-col justify-between hover:border-[#383838] transition-colors">
            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-[#10B981]">
                Monthly Free Tier
              </div>
              <div className="mt-3 flex items-baseline gap-1 font-mono">
                <span className="text-3xl sm:text-4xl font-semibold text-white tabular-nums">
                  $0
                </span>
                <span className="text-xs text-[#A1A1A1] font-sans">/ forever</span>
              </div>
              <p className="mt-2 text-xs text-[#A1A1A1]">
                Permanent recurring monthly allotment. Not an expiring trial.
              </p>

              <div className="my-6 border-t border-[#262626]"></div>

              <ul className="space-y-3 text-xs text-[#EDEDED]">
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-mono font-bold">✓</span>
                  <span>
                    <strong className="text-white">2 full videos</strong> per month
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-mono font-bold">✓</span>
                  <span>
                    Up to <strong className="text-white">10 minutes</strong> per source video
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-mono font-bold">✓</span>
                  <span>Full Gemini structured scoring</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-mono font-bold">✓</span>
                  <span>9:16 export with burned-in captions</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-mono font-bold">✓</span>
                  <span>Magic link email authentication</span>
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <a
                href="#app"
                className="block w-full text-center rounded-full border border-[#262626] bg-[#111111] hover:bg-[#1C1C1C] py-2 text-xs font-semibold text-white transition-colors"
              >
                Start Free (2 Videos/Mo)
              </a>
            </div>
          </div>

          {/* Pay-Per-Video Top-Up (Popular) */}
          <div className="relative rounded-xl border border-white bg-[#0A0A0A] p-6 flex flex-col justify-between shadow-[0_0_50px_-15px_rgba(255,255,255,0.08)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-black">
              Most Popular
            </div>

            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-[#FF5722]">
                Creator Top-Up
              </div>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap font-mono">
                <span className="text-3xl sm:text-4xl font-semibold text-white tabular-nums">
                  $12
                </span>
                <span className="text-xl sm:text-2xl font-medium text-[#FF5722] tabular-nums">
                  / ₹999
                </span>
                <span className="text-xs text-[#A1A1A1] font-sans">one-time pack</span>
              </div>
              <p className="mt-2 text-xs text-[#A1A1A1]">
                Pay once via UPI (GPay/PhonePe) or Cards. No recurring subscription lock-in.
              </p>

              <div className="my-6 border-t border-[#262626]"></div>

              <ul className="space-y-3 text-xs text-[#EDEDED]">
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-mono font-bold">✓</span>
                  <span>
                    <strong className="text-white">10 additional video credits</strong> (₹99/video)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-mono font-bold">✓</span>
                  <span>
                    Up to <strong className="text-white">60 minutes</strong> per video
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-mono font-bold">✓</span>
                  <span>Priority transcription &amp; rendering queue</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-mono font-bold">✓</span>
                  <span>Multi-aspect exports (9:16, 1:1, 16:9)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-mono font-bold">✓</span>
                  <span>Word-level filler-word trimming</span>
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <CheckoutButton
                packId="creator_10"
                label="Buy 10 Credits (UPI / Card)"
                className="block w-full text-center rounded-full bg-white py-2 text-xs font-semibold text-black hover:bg-[#E5E5E5] transition-colors shadow-sm"
              />
            </div>
          </div>

          {/* Agency / High Volume */}
          <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] p-6 flex flex-col justify-between hover:border-[#383838] transition-colors">
            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-[#FFB800]">
                Pro Pack / Agency
              </div>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap font-mono">
                <span className="text-3xl sm:text-4xl font-semibold text-white tabular-nums">
                  $49
                </span>
                <span className="text-xl sm:text-2xl font-medium text-[#FFB800] tabular-nums">
                  / ₹3,999
                </span>
                <span className="text-xs text-[#A1A1A1] font-sans">one-time pack</span>
              </div>
              <p className="mt-2 text-xs text-[#A1A1A1]">
                For production teams and active podcast studios. Instant UPI or Cards.
              </p>

              <div className="my-6 border-t border-[#262626]"></div>

              <ul className="space-y-3 text-xs text-[#EDEDED]">
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-mono font-bold">✓</span>
                  <span>
                    <strong className="text-white">50 video credits</strong> ($0.98/video)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-mono font-bold">✓</span>
                  <span>
                    Up to <strong className="text-white">120 minutes</strong> per episode
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-mono font-bold">✓</span>
                  <span>Bulk batch export</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-mono font-bold">✓</span>
                  <span>Dedicated worker rendering priority</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-mono font-bold">✓</span>
                  <span>Phase 2 API early access</span>
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <CheckoutButton
                packId="pro_50"
                label="Buy 50 Credits Pack"
                className="block w-full text-center rounded-full border border-[#262626] bg-[#111111] hover:bg-[#1C1C1C] py-2 text-xs font-semibold text-white transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Plain HTML Table for Direct Crawler Certainty (Rule B) */}
        <div className="mt-12 overflow-x-auto">
          <table className="w-full text-left text-xs border border-[#262626] rounded-lg">
            <thead className="bg-[#0A0A0A] text-[#A1A1A1] border-b border-[#262626] font-mono uppercase text-[11px]">
              <tr>
                <th className="p-3.5 font-medium">Tier Plan</th>
                <th className="p-3.5 font-medium">Price</th>
                <th className="p-3.5 font-medium">Video Length Cap</th>
                <th className="p-3.5 font-medium">Monthly Limit</th>
                <th className="p-3.5 font-medium">Cost Per Video</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626] text-[#EDEDED] font-mono">
              <tr>
                <td className="p-3.5 font-medium text-white font-sans">Free Monthly Allotment</td>
                <td className="p-3.5 text-[#10B981] font-semibold tabular-nums">$0.00</td>
                <td className="p-3.5 font-sans">Up to 10 minutes</td>
                <td className="p-3.5 font-sans">2 videos / month</td>
                <td className="p-3.5 tabular-nums">$0.00</td>
              </tr>
              <tr>
                <td className="p-3.5 font-medium text-white font-sans">Creator Top-Up (10 Pack)</td>
                <td className="p-3.5 text-[#FF5722] font-semibold tabular-nums">$12.00 / ₹999</td>
                <td className="p-3.5 font-sans">Up to 60 minutes</td>
                <td className="p-3.5 font-sans">Pay-as-you-go</td>
                <td className="p-3.5 tabular-nums font-semibold">$1.20 / ₹99.90</td>
              </tr>
              <tr>
                <td className="p-3.5 font-medium text-white font-sans">Pro Pack (50 Pack)</td>
                <td className="p-3.5 text-[#FFB800] font-semibold tabular-nums">$49.00 / ₹3,999</td>
                <td className="p-3.5 font-sans">Up to 120 minutes</td>
                <td className="p-3.5 font-sans">Pay-as-you-go</td>
                <td className="p-3.5 tabular-nums font-semibold">$0.98 / ₹79.98</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
