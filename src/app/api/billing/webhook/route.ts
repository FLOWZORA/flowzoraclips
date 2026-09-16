import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { fulfillCreditPurchase } from '@/lib/billing/stripe';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    if (webhookSecret && signature) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2025-02-24.acacia' as any,
      });
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      // In dev or test mode without webhook secret
      event = JSON.parse(rawBody);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId || 'demo-user-1';
      const creditsToAdd = Number(session.metadata?.credits || 10);
      const amountPaid = session.amount_total || 1200;

      const newBalance = await fulfillCreditPurchase(
        userId,
        creditsToAdd,
        session.id,
        amountPaid
      );

      console.log(`[Stripe Webhook] Successfully credited user ${userId} with +${creditsToAdd} credits. New balance: ${newBalance}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Stripe webhook processing error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
