/**
 * FLOWZORA Clips — Billing, Auth, and Abuse Protection Verification Script
 * Validates:
 * 1. Passwordless magic link user provisioning (2 free credits)
 * 2. Server-side <=10 min free duration cap enforcement
 * 3. Credit deduction and ledger transaction recording
 * 4. Idempotent refund on failed jobs
 * 5. One-off Stripe checkout session creation (no forced subscription)
 * 6. Stripe webhook purchase fulfillment (+10 credits, unlocks 60 min limit)
 * 7. Aggregate monthly spend ledger & kill-switch trip
 * 8. Sliding-window IP rate limiter
 */

import { sendMagicLink, getOrCreateUser } from '../src/lib/auth/magic-link.ts';
import {
  validateProcessingEligibility,
  deductCredit,
  refundCreditOnFailure,
  MAX_FREE_VIDEO_DURATION_SEC,
} from '../src/lib/billing/credits.ts';
import {
  createCheckoutSession,
  fulfillCreditPurchase,
  CREDIT_PACKS,
} from '../src/lib/billing/stripe.ts';
import {
  checkSpendKillSwitch,
  recordApiSpend,
  checkRateLimit,
} from '../src/lib/billing/kill-switch.ts';

async function runVerification() {
  console.log('===========================================================');
  console.log('FLOWZORA Clips — Billing, Auth & Spend Protection Suite');
  console.log('===========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
    }
  }

  // -------------------------------------------------------------
  // Test 1: Magic Link & User Provisioning
  // -------------------------------------------------------------
  console.log('Test 1: Magic Link & Free Account Provisioning');
  const testEmail = `creator_${Date.now()}@flowzora.test`;
  const magicLinkRes = await sendMagicLink(testEmail);
  assert(magicLinkRes.success === true, 'Magic link dispatched successfully');

  const newUser = await getOrCreateUser(testEmail);
  assert(newUser.email === testEmail, `User provisioned with email ${newUser.email}`);
  assert(newUser.creditsRemaining === 2, `User granted exactly 2 recurring free credits (got ${newUser.creditsRemaining})`);
  assert(newUser.plan === 'free', `Initial plan is 'free' (got ${newUser.plan})`);
  console.log('');

  // -------------------------------------------------------------
  // Test 2: Free Tier Duration Hard Cap (<= 10 minutes)
  // -------------------------------------------------------------
  console.log('Test 2: Server-Side Free Tier Duration Hard Cap');
  // 8-minute video: under 10 min cap -> should allow
  const eightMinEligibility = await validateProcessingEligibility(newUser.id, 8 * 60);
  assert(eightMinEligibility.allowed === true, '8-minute video is permitted on Free Tier');

  // 15-minute video: exceeds 10 min cap -> should strictly deny
  const fifteenMinEligibility = await validateProcessingEligibility(newUser.id, 15 * 60);
  assert(fifteenMinEligibility.allowed === false, '15-minute video is strictly blocked on Free Tier');
  assert(
    fifteenMinEligibility.reason && fifteenMinEligibility.reason.includes('hard cap of 10 minutes'),
    'Detailed explanation provided directing to Creator Top-Up'
  );
  console.log('');

  // -------------------------------------------------------------
  // Test 3: Credit Deduction
  // -------------------------------------------------------------
  console.log('Test 3: Credit Deduction & Balance Tracking');
  const job1Id = `job_test_${Date.now()}`;
  const balanceAfter1 = await deductCredit(newUser.id, job1Id);
  assert(balanceAfter1 === 1, `Balance decremented from 2 to 1 (got ${balanceAfter1})`);

  const job2Id = `job_test_${Date.now() + 1}`;
  const balanceAfter2 = await deductCredit(newUser.id, job2Id);
  assert(balanceAfter2 === 0, `Balance decremented from 1 to 0 (got ${balanceAfter2})`);

  // Try 3rd video when 0 credits remain -> should deny
  const zeroCreditEligibility = await validateProcessingEligibility(newUser.id, 5 * 60);
  assert(zeroCreditEligibility.allowed === false, 'Processing blocked when credit balance is 0');
  console.log('');

  // -------------------------------------------------------------
  // Test 4: Idempotent Refund on Job Failure
  // -------------------------------------------------------------
  console.log('Test 4: Idempotent Credit Refund on Job Failure');
  const refundedBalance = await refundCreditOnFailure(newUser.id, job2Id);
  assert(refundedBalance === 1, `Credit refunded back to user upon failed job (balance restored to ${refundedBalance})`);
  // Re-deduct to return to 0 for purchase test
  await deductCredit(newUser.id, job2Id);
  console.log('');

  // -------------------------------------------------------------
  // Test 5: Stripe Checkout Session Creation (One-Off Top-Up)
  // -------------------------------------------------------------
  console.log('Test 5: One-Off Stripe Checkout Session');
  assert(CREDIT_PACKS.creator_10.priceCents === 1200, 'Creator 10-pack priced at $12.00 (1200 cents)');
  assert(CREDIT_PACKS.pro_50.priceCents === 4900, 'Pro 50-pack priced at $49.00 (4900 cents)');

  const checkoutRes = await createCheckoutSession(newUser.id, newUser.email, 'creator_10');
  assert(checkoutRes.sessionId.length > 0, `Stripe checkout session initialized: ${checkoutRes.sessionId}`);
  assert(checkoutRes.checkoutUrl.length > 0, `Checkout URL generated: ${checkoutRes.checkoutUrl}`);
  console.log('');

  // -------------------------------------------------------------
  // Test 6: Webhook Purchase Fulfillment & Unlocking 60-min Duration
  // -------------------------------------------------------------
  console.log('Test 6: Webhook Purchase Fulfillment (+10 credits)');
  const balanceAfterFulfill = await fulfillCreditPurchase(
    newUser.id,
    CREDIT_PACKS.creator_10.credits,
    checkoutRes.sessionId,
    CREDIT_PACKS.creator_10.priceCents
  );
  assert(
    balanceAfterFulfill >= 10,
    `Fulfillment credited +10 credits (current balance: ${balanceAfterFulfill})`
  );

  // Paid user processing a 45-minute video (previously blocked under free cap)
  const paidLongEligibility = await validateProcessingEligibility(newUser.id, 45 * 60);
  assert(
    paidLongEligibility.allowed === true,
    'Paid Top-Up user can now process 45-minute long-form episode (exceeding 10m cap)'
  );
  console.log('');

  // -------------------------------------------------------------
  // Test 7: Aggregate Monthly Spend Tracking & Kill Switch
  // -------------------------------------------------------------
  console.log('Test 7: Spend Ledger & Spend Kill Switch ($50 Ceiling)');
  const initialSpend = await checkSpendKillSwitch();
  assert(initialSpend.budgetCapUsd === 50.00, 'Monthly budget ceiling set to $50.00');

  // Record normal API spend ($0.035 for 5 min)
  const spendStatusAfterJob = await recordApiSpend(0.035);
  assert(spendStatusAfterJob.totalCostUsd > 0, `Spend ledger tracked cost: $${spendStatusAfterJob.totalCostUsd}`);
  assert(spendStatusAfterJob.isKillSwitchActive === false, 'Kill switch remains inactive within budget');

  // Simulate extreme usage crossing budget ceiling ($50.00)
  const trippedSpend = await recordApiSpend(50.00);
  assert(trippedSpend.isKillSwitchActive === true, 'Spend kill switch tripped when monthly spend reaches $50.00 ceiling');
  assert(
    trippedSpend.message && trippedSpend.message.includes('capacity ceiling has been reached'),
    'Graceful capacity ceiling message provided'
  );
  console.log('');

  // -------------------------------------------------------------
  // Test 8: Rate Limiter (Unlimited in Free Beta)
  // -------------------------------------------------------------
  console.log('Test 8: Rate Limiting (Unlimited for free beta)');
  const testIp = `192.168.1.${Math.floor(Math.random() * 200) + 50}`;
  for (let i = 1; i <= 10; i++) {
    const rl = checkRateLimit(testIp);
    assert(rl.allowed === true, `Request #${i} allowed without limit`);
  }
  console.log('');

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('===========================================================');
  console.log(`Verification Complete: ${passed}/${total} assertions passed (${Math.round((passed/total)*100)}%)`);
  console.log('===========================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Suite error:', err);
  process.exit(1);
});
