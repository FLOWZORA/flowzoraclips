import React from 'react';
import Link from 'next/link';
import CheckoutButton from './CheckoutButton';

export default function PricingTable() {
  return (
    <section id="pricing" className="border-t border-[#242938] bg-[#0A0B10] py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-[var(--font-outfit)]">
            Transparent Pricing Without Forced Subscriptions
          </h2>
          <p className="mt-3 text-sm text-[#9AA2B6]">
            A permanent recurring free monthly allowance for solo creators, plus straightforward pay-per-video top-ups when you have more content to clip.
          </p>
        </div>

        {/* Crawlable Plain-HTML Pricing Grid (Pure React Server Component with client checkout triggers) */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Free Tier Card */}
          <div className="rounded-xl border border-[#2B3040] bg-[#141620] p-6 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#10B981]">
                Monthly Free Tier
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-black text-white font-[var(--font-outfit)]">
                  $0
                </span>
                <span className="text-xs text-[#9AA2B6]">/ forever</span>
              </div>
              <p className="mt-2 text-xs text-[#9AA2B6]">
                Permanent recurring monthly allotment. Not an expiring trial.
              </p>

              <div className="my-6 border-t border-[#242938]"></div>

              <ul className="space-y-3 text-xs text-white">
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-bold">✓</span>
                  <span>
                    <strong>2 full videos</strong> per month
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-bold">✓</span>
                  <span>
                    Up to <strong>10 minutes</strong> per source video
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-bold">✓</span>
                  <span>Full Gemini structured scoring</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-bold">✓</span>
                  <span>9:16 export with burned-in captions</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#10B981] font-bold">✓</span>
                  <span>Magic link email authentication</span>
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <a
                href="#app"
                className="block w-full text-center rounded-lg border border-[#2B3040] bg-[#1E2230] py-2.5 text-xs font-bold text-white hover:border-[#FF5722] hover:text-[#FF5722] transition-colors"
              >
                Start Free (2 Videos/Mo)
              </a>
            </div>
          </div>

          {/* Pay-Per-Video Top-Up (Popular) */}
          <div className="relative rounded-xl border-2 border-[#FF5722] bg-[#141620] p-6 flex flex-col justify-between shadow-xl">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#FF5722] px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">
              Most Popular
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#FF5722]">
                Creator Top-Up
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-black text-white font-[var(--font-outfit)]">
                  $12
                </span>
                <span className="text-xs text-[#9AA2B6]">one-time pack</span>
              </div>
              <p className="mt-2 text-xs text-[#9AA2B6]">
                Pay once, use anytime. No recurring monthly credit card lock-in.
              </p>

              <div className="my-6 border-t border-[#242938]"></div>

              <ul className="space-y-3 text-xs text-white">
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-bold">✓</span>
                  <span>
                    <strong>10 additional video credits</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-bold">✓</span>
                  <span>
                    Up to <strong>60 minutes</strong> per video
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-bold">✓</span>
                  <span>Priority transcription & rendering queue</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-bold">✓</span>
                  <span>Multi-aspect exports (9:16, 1:1, 16:9)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FF5722] font-bold">✓</span>
                  <span>Word-level filler-word trimming</span>
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <CheckoutButton
                packId="creator_10"
                label="Buy 10 Credits ($1.20/video)"
                className="block w-full text-center rounded-lg bg-[#FF5722] py-2.5 text-xs font-bold text-white hover:bg-[#F44336] transition-colors shadow-md"
              />
            </div>
          </div>

          {/* Agency / High Volume */}
          <div className="rounded-xl border border-[#2B3040] bg-[#141620] p-6 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#FFB800]">
                Pro Pack / Agency
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-black text-white font-[var(--font-outfit)]">
                  $49
                </span>
                <span className="text-xs text-[#9AA2B6]">one-time pack</span>
              </div>
              <p className="mt-2 text-xs text-[#9AA2B6]">
                For production teams and active podcast studios.
              </p>

              <div className="my-6 border-t border-[#242938]"></div>

              <ul className="space-y-3 text-xs text-white">
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-bold">✓</span>
                  <span>
                    <strong>50 video credits</strong> ($0.98/video)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-bold">✓</span>
                  <span>
                    Up to <strong>120 minutes</strong> per episode
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-bold">✓</span>
                  <span>Bulk batch export</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-bold">✓</span>
                  <span>Dedicated worker rendering priority</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#FFB800] font-bold">✓</span>
                  <span>Phase 2 API early access</span>
                </li>
              </ul>
            </div>

            <div className="mt-8">
              <CheckoutButton
                packId="pro_50"
                label="Buy 50 Credits Pack"
                className="block w-full text-center rounded-lg border border-[#2B3040] bg-[#1E2230] py-2.5 text-xs font-bold text-white hover:border-[#FFB800] hover:text-[#FFB800] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Plain HTML Table for Direct Crawler Certainty */}
        <div className="mt-12 overflow-x-auto">
          <table className="w-full text-left text-xs border border-[#242938] rounded-lg">
            <thead className="bg-[#141620] text-[#9AA2B6] border-b border-[#242938]">
              <tr>
                <th className="p-3 font-semibold">Tier Plan</th>
                <th className="p-3 font-semibold">Price</th>
                <th className="p-3 font-semibold">Video Length Cap</th>
                <th className="p-3 font-semibold">Monthly Limit</th>
                <th className="p-3 font-semibold">Cost Per Video</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#242938] text-white">
              <tr>
                <td className="p-3 font-bold">Free Monthly Allotment</td>
                <td className="p-3 text-[#10B981] font-bold">$0.00</td>
                <td className="p-3">Up to 10 minutes</td>
                <td className="p-3">2 videos / month</td>
                <td className="p-3">$0.00</td>
              </tr>
              <tr>
                <td className="p-3 font-bold">Creator Top-Up (10 Pack)</td>
                <td className="p-3 text-[#FF5722] font-bold">$12.00 one-off</td>
                <td className="p-3">Up to 60 minutes</td>
                <td className="p-3">Pay-as-you-go</td>
                <td className="p-3 font-semibold">$1.20 / video</td>
              </tr>
              <tr>
                <td className="p-3 font-bold">Pro Pack (50 Pack)</td>
                <td className="p-3 text-[#FFB800] font-bold">$49.00 one-off</td>
                <td className="p-3">Up to 120 minutes</td>
                <td className="p-3">Pay-as-you-go</td>
                <td className="p-3 font-semibold">$0.98 / video</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
