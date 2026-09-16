import { NextRequest, NextResponse } from 'next/server';
import { verifyRazorpaySignature, fulfillRazorpayPurchase } from '@/lib/billing/razorpay';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const eventType = event.event;

    // Handle payment completion events
    if (eventType === 'payment_link.paid' || eventType === 'order.paid' || eventType === 'payment.captured') {
      const payload = event.payload?.payment_link?.entity || event.payload?.payment?.entity;
      const notes = payload?.notes || {};
      const userId = notes.userId || 'demo-user-1';
      const credits = Number(notes.credits || 10);
      const amountPaise = Number(payload?.amount || 99900);
      const paymentRef = payload?.id || `rzp_pay_${Date.now()}`;

      // Fulfill purchase into Supabase database & transactions ledger
      const newBalance = await fulfillRazorpayPurchase(userId, credits, paymentRef, amountPaise);
      console.log(`[Razorpay Webhook] Granted ${credits} credits to ${userId}. New balance: ${newBalance}`);

      return NextResponse.json({ received: true, userId, newBalance });
    }

    return NextResponse.json({ received: true, ignoredEvent: eventType });
  } catch (error: any) {
    console.error('Razorpay webhook handler error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
