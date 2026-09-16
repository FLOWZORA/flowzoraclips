import { NextRequest, NextResponse } from 'next/server';
import { sendMagicLink, getOrCreateUser } from '@/lib/auth/magic-link';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectTo = `${protocol}://${host}/?auth=callback`;

    // Send magic link & provision user record
    const result = await sendMagicLink(email, redirectTo);
    const user = await getOrCreateUser(email);

    return NextResponse.json({
      success: true,
      message: result.message,
      user: {
        id: user.id,
        email: user.email,
        creditsRemaining: user.creditsRemaining,
        plan: user.plan,
        monthlyAllowance: user.monthlyAllowance,
      },
    });
  } catch (error: any) {
    console.error('Magic link auth error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to dispatch magic link.' },
      { status: 500 }
    );
  }
}
