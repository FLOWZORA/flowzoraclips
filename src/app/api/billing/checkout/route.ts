import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession, CREDIT_PACKS } from '@/lib/billing/stripe';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId = 'demo-user-1', email = 'creator@flowzoraclips.com', packId = 'creator_10' } = body;

    if (!CREDIT_PACKS[packId]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid packId. Available packs: ${Object.keys(CREDIT_PACKS).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const origin = req.headers.get('origin') || req.headers.get('host')
      ? `${req.headers.get('origin') || `http://${req.headers.get('host')}`}`
      : 'http://localhost:3000';

    const session = await createCheckoutSession(userId, email, packId, origin);

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      checkoutUrl: session.checkoutUrl,
      pack: CREDIT_PACKS[packId],
    });
  } catch (error: any) {
    console.error('Checkout API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
