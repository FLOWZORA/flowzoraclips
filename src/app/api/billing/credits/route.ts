import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, inMemoryDb } from '@/lib/db/supabase';
import { checkSpendKillSwitch, checkRateLimit } from '@/lib/billing/kill-switch';
import { IS_COMPLETELY_FREE } from '@/lib/billing/credits';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'demo-user-1';

    // Get client IP / ID for rate limiting
    const forwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
    const rateLimit = checkRateLimit(clientIp);

    // Spend kill switch status
    const spendStatus = await checkSpendKillSwitch();

    // In 100% free beta mode, return unlimited status
    if (IS_COMPLETELY_FREE) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        user: {
          id: userId,
          email: '',
          creditsRemaining: 999,
          monthlyAllowance: 999,
          plan: 'free_beta',
        },
        spendStatus,
        rateLimit,
      });
    }

    // Query user record
    let user: any = null;
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      user = data;
    } else {
      user = inMemoryDb.users.get(userId) || inMemoryDb.users.get('demo-user-1');
      if (!user && userId) {
        // Find by id in values
        user = Array.from(inMemoryDb.users.values()).find((u) => u.id === userId);
      }
    }

    if (!user) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        creditsRemaining: 2, // Free allowance preview
        monthlyAllowance: 2,
        plan: 'free',
        spendStatus,
        rateLimit,
      });
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        creditsRemaining: user.credits_remaining ?? 0,
        monthlyAllowance: user.monthly_allowance ?? 2,
        plan: user.plan || 'free',
      },
      spendStatus,
      rateLimit,
    });
  } catch (error: any) {
    console.error('Credits API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve credit details' },
      { status: 500 }
    );
  }
}
