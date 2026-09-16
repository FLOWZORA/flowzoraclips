import crypto from 'crypto';
import { getSupabaseAdmin, inMemoryDb } from '../db/supabase';

export interface RazorpayCreditPack {
  id: string;
  name: string;
  credits: number;
  priceInr: number;
  pricePaise: number;
  priceDisplay: string;
  priceUsd: string;
  maxVideoDurationMin: number;
  description: string;
}

export const RAZORPAY_CREDIT_PACKS: Record<string, RazorpayCreditPack> = {
  creator_10: {
    id: 'creator_10',
    name: 'Creator Top-Up (10 Videos)',
    credits: 10,
    priceInr: 999,
    pricePaise: 99900,
    priceDisplay: '₹999',
    priceUsd: '$12.00',
    maxVideoDurationMin: 60,
    description: '10 video credits up to 60 minutes each. Instant UPI (GPay/PhonePe) or card payment.',
  },
  pro_50: {
    id: 'pro_50',
    name: 'Pro Pack (50 Videos)',
    credits: 50,
    priceInr: 3999,
    pricePaise: 399900,
    priceDisplay: '₹3,999',
    priceUsd: '$49.00',
    maxVideoDurationMin: 120,
    description: '50 video credits up to 120 minutes each with priority rendering. Instant UPI / Cards.',
  },
};

/**
 * Creates a Razorpay Payment Link supporting instant UPI (GPay, PhonePe, Paytm, QR) & Cards.
 * When keys are not configured, provides seamless local simulation.
 */
export async function createRazorpayPaymentLink(
  userId: string,
  email: string,
  packId: string = 'creator_10',
  originUrl: string = 'http://localhost:3000'
): Promise<{ paymentLinkId: string; checkoutUrl: string }> {
  const pack = RAZORPAY_CREDIT_PACKS[packId] || RAZORPAY_CREDIT_PACKS.creator_10;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (keyId && keySecret && !keyId.includes('YourRazorpayKey')) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: pack.pricePaise,
          currency: 'INR',
          accept_partial: false,
          description: `FLOWZORA Clips — ${pack.name}`,
          customer: {
            name: email.split('@')[0],
            email: email,
          },
          notify: {
            sms: false,
            email: true,
          },
          reminder_enable: false,
          notes: {
            userId,
            packId,
            credits: String(pack.credits),
          },
          callback_url: `${originUrl}/?payment=success&credits=${pack.credits}&gateway=razorpay`,
          callback_method: 'get',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          paymentLinkId: data.id,
          checkoutUrl: data.short_url,
        };
      } else {
        const errorText = await response.text();
        console.warn(`Razorpay Payment Link API error (${response.status}): ${errorText}`);
      }
    } catch (err) {
      console.warn('Razorpay API request error:', err);
    }
  }

  // Simulation mode for local dev & testing
  console.log(`[Razorpay Simulation] Created UPI/Card payment link for user ${userId}, pack: ${pack.name} (${pack.priceDisplay})`);
  return {
    paymentLinkId: `sim_rzp_${Date.now()}`,
    checkoutUrl: `${originUrl}/?payment=simulated_success&credits=${pack.credits}&pack=${packId}&gateway=razorpay`,
  };
}

/**
 * Validates webhook / callback payment signature from Razorpay.
 */
export function verifyRazorpaySignature(
  orderIdOrLinkId: string,
  paymentId: string,
  signature: string,
  secret?: string
): boolean {
  const secretKey = secret || process.env.RAZORPAY_KEY_SECRET;
  if (!secretKey) return true; // Simulation mode

  const generatedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(`${orderIdOrLinkId}|${paymentId}`)
    .digest('hex');

  return generatedSignature === signature;
}

/**
 * Fulfills credit purchase from Razorpay payment.
 */
export async function fulfillRazorpayPurchase(
  userId: string,
  creditsToAdd: number,
  razorpayRef: string,
  amountPaidPaise: number
): Promise<number> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: user } = await supabase
      .from('users')
      .select('credits_remaining, plan')
      .eq('id', userId)
      .single();

    if (user) {
      const newBalance = user.credits_remaining + creditsToAdd;
      await supabase
        .from('users')
        .update({
          credits_remaining: newBalance,
          plan: 'creator_topup',
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      await supabase.from('transactions').insert({
        user_id: userId,
        type: 'top_up_purchase',
        amount: creditsToAdd,
        stripe_ref: razorpayRef, // stores payment gateway ref
        amount_paid_cents: Math.round(amountPaidPaise / 100 * 1.2), // approx cents equivalent
      });

      return newBalance;
    }
  }

  // Fallback to in-memory DB
  const user = inMemoryDb.users.get(userId) || inMemoryDb.users.get('demo-user-1');
  if (user) {
    user.credits_remaining += creditsToAdd;
    user.plan = 'creator_topup';
    inMemoryDb.transactions.set(`tx-rzp-${Date.now()}`, {
      user_id: userId,
      type: 'top_up_purchase',
      amount: creditsToAdd,
      stripe_ref: razorpayRef,
      amount_paid_cents: Math.round(amountPaidPaise / 100),
      created_at: new Date().toISOString(),
    });
    return user.credits_remaining;
  }

  return creditsToAdd;
}
