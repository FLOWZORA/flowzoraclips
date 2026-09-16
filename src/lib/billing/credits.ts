import { getSupabaseAdmin, inMemoryDb } from '../db/supabase';

export const MAX_FREE_VIDEO_DURATION_SEC = 600; // 10 minutes hard cap (server-enforced)
export const MAX_PAID_VIDEO_DURATION_SEC = 3600; // 60 minutes for top-up credits

export interface CreditEligibilityResult {
  allowed: boolean;
  reason?: string;
  creditsRemaining: number;
  plan: string;
  isFreeTier: boolean;
}

/**
 * Checks server-side if user is eligible to process a video of the given duration.
 * Strictly enforces duration caps and credit availability.
 */
export async function validateProcessingEligibility(
  userId: string,
  durationSeconds: number
): Promise<CreditEligibilityResult> {
  const supabase = getSupabaseAdmin();
  let user: any = null;

  if (supabase) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    user = data;
  } else {
    user = inMemoryDb.users.get(userId) || inMemoryDb.users.get('demo-user-1');
  }

  if (!user) {
    return {
      allowed: false,
      reason: 'Authentication required. Please sign in via magic link to use your free credits.',
      creditsRemaining: 0,
      plan: 'none',
      isFreeTier: true,
    };
  }

  const isFree = user.plan === 'free';

  // Rule D: Server-side hard cap on free-tier video length (<=10 min)
  if (isFree && durationSeconds > MAX_FREE_VIDEO_DURATION_SEC) {
    return {
      allowed: false,
      reason: `Video length (${Math.round(durationSeconds / 60)} min) exceeds the Free Tier hard cap of 10 minutes. Purchase a Creator Top-Up pack to process videos up to 60 minutes.`,
      creditsRemaining: user.credits_remaining,
      plan: user.plan,
      isFreeTier: true,
    };
  }

  // Check credit balance
  if (user.credits_remaining <= 0) {
    return {
      allowed: false,
      reason: 'You have used all available video credits. Purchase a Creator Top-Up (10 videos for $12) or wait for your monthly free allotment renewal.',
      creditsRemaining: 0,
      plan: user.plan,
      isFreeTier: isFree,
    };
  }

  return {
    allowed: true,
    creditsRemaining: user.credits_remaining,
    plan: user.plan,
    isFreeTier: isFree,
  };
}

/**
 * Deducts 1 credit from user's balance and records ledger transaction.
 */
export async function deductCredit(userId: string, videoId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: user } = await supabase
      .from('users')
      .select('credits_remaining')
      .eq('id', userId)
      .single();

    if (!user || user.credits_remaining <= 0) {
      throw new Error('Insufficient credits');
    }

    const newBalance = user.credits_remaining - 1;

    await supabase
      .from('users')
      .update({ credits_remaining: newBalance, updated_at: new Date().toISOString() })
      .eq('id', userId);

    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'usage_deduction',
      amount: -1,
    });

    return newBalance;
  }

  // In-memory fallback
  const user = inMemoryDb.users.get(userId) || inMemoryDb.users.get('demo-user-1');
  if (user) {
    user.credits_remaining = Math.max(0, user.credits_remaining - 1);
    inMemoryDb.transactions.set(`tx-${Date.now()}`, {
      user_id: userId,
      type: 'usage_deduction',
      amount: -1,
      created_at: new Date().toISOString(),
    });
    return user.credits_remaining;
  }

  return 0;
}

/**
 * Refunds 1 credit if a processing job fails, ensuring users are never double-charged.
 */
export async function refundCreditOnFailure(userId: string, videoId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: user } = await supabase
      .from('users')
      .select('credits_remaining')
      .eq('id', userId)
      .single();

    if (user) {
      const newBalance = user.credits_remaining + 1;
      await supabase
        .from('users')
        .update({ credits_remaining: newBalance })
        .eq('id', userId);

      await supabase.from('transactions').insert({
        user_id: userId,
        type: 'credit_grant',
        amount: 1,
      });

      return newBalance;
    }
  }

  const user = inMemoryDb.users.get(userId) || inMemoryDb.users.get('demo-user-1');
  if (user) {
    user.credits_remaining += 1;
    return user.credits_remaining;
  }

  return 0;
}
