import Stripe from 'stripe';
import { getSupabaseAdmin, inMemoryDb } from '../db/supabase';

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  priceUsd: string;
  pricePerVideoUsd: string;
  maxVideoDurationMin: number;
  description: string;
}

export const CREDIT_PACKS: Record<string, CreditPack> = {
  creator_10: {
    id: 'creator_10',
    name: 'Creator Top-Up (10 Videos)',
    credits: 10,
    priceCents: 1200,
    priceUsd: '$12.00',
    pricePerVideoUsd: '$1.20',
    maxVideoDurationMin: 60,
    description: '10 additional video credits up to 60 minutes each. One-off purchase, no subscription.',
  },
  pro_50: {
    id: 'pro_50',
    name: 'Pro Pack (50 Videos)',
    credits: 50,
    priceCents: 4900,
    priceUsd: '$49.00',
    pricePerVideoUsd: '$0.98',
    maxVideoDurationMin: 120,
    description: '50 video credits up to 120 minutes each with priority rendering.',
  },
};

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' as any });
}

/**
 * Creates a one-off Stripe Checkout session for a credit top-up pack.
 * Never enforces a recurring subscription on v1.
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  packId: string = 'creator_10',
  originUrl: string = 'http://localhost:3000'
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const pack = CREDIT_PACKS[packId] || CREDIT_PACKS.creator_10;
  const stripe = getStripeClient();

  if (stripe) {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment', // ONE-OFF CHARGE, no subscription!
      customer_email: email,
      client_reference_id: userId,
      metadata: {
        userId,
        packId,
        credits: String(pack.credits),
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `FLOWZORA Clips — ${pack.name}`,
              description: pack.description,
            },
            unit_amount: pack.priceCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${originUrl}/?payment=success&credits=${pack.credits}`,
      cancel_url: `${originUrl}/pricing?payment=cancelled`,
    });

    return {
      sessionId: session.id,
      checkoutUrl: session.url || `${originUrl}/?payment=success`,
    };
  }

  // Simulated checkout session for local development
  console.log(`[Stripe Simulation] Created checkout session for user ${userId}, pack: ${pack.name} (${pack.priceUsd})`);
  return {
    sessionId: `sim_sess_${Date.now()}`,
    checkoutUrl: `${originUrl}/?payment=simulated_success&credits=${pack.credits}&pack=${packId}`,
  };
}

/**
 * Handles Stripe webhook to grant credits upon verified payment completion.
 */
export async function fulfillCreditPurchase(
  userId: string,
  creditsToAdd: number,
  stripeSessionId: string,
  amountPaidCents: number
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
        stripe_ref: stripeSessionId,
        amount_paid_cents: amountPaidCents,
      });

      return newBalance;
    }
  }

  // Fallback to in-memory store
  const user = inMemoryDb.users.get(userId) || inMemoryDb.users.get('demo-user-1');
  if (user) {
    user.credits_remaining += creditsToAdd;
    user.plan = 'creator_topup';
    inMemoryDb.transactions.set(`tx-stripe-${Date.now()}`, {
      user_id: userId,
      type: 'top_up_purchase',
      amount: creditsToAdd,
      stripe_ref: stripeSessionId,
      amount_paid_cents: amountPaidCents,
      created_at: new Date().toISOString(),
    });
    return user.credits_remaining;
  }

  return creditsToAdd;
}
