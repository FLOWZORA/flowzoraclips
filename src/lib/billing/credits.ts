import { getSupabaseAdmin, inMemoryDb } from '../db/supabase';

export const IS_COMPLETELY_FREE: boolean = true; // Toggle for 100% free beta period
export const MAX_FREE_VIDEO_DURATION_SEC = 600; // 10 minutes default free cap
export const MAX_PAID_VIDEO_DURATION_SEC = 7200; // 120 minutes (2 hours) max processing cap for podcasts & talk shows

/**
 * Hard ceiling imposed by the serverless runtime, not by any pricing plan.
 *
 * Audio is extracted locally with ffmpeg as 64kbps mono MP3 (~8 KB/s), so a
 * 180-min video yields ~82 MB of audio. Audio over Groq / OpenAI's 25 MB
 * single-call limit is split into sequential chunks and transcribed
 * piece-by-piece with timestamps re-offset, then concatenated. Videos over
 * ~2 hours run as background jobs (Inngest) so sources up to ~180 minutes
 * (3 hours) are supported.
 *
 * Duration is measured from the real container header (ffmpeg probe), never
 * guessed from file size. Raising this further requires a bigger runtime
 * budget (Vercel Pro allows 300s) or moving the pipeline behind an async
 * job queue.
 */
export const MAX_SERVERLESS_DURATION_SEC = 10800; // 180 minutes (3 hours)

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
  // If in 100% free beta mode, allow all users with high duration limits (up to 120 min)
  if (IS_COMPLETELY_FREE) {
    if (durationSeconds > MAX_SERVERLESS_DURATION_SEC) {
      return {
        allowed: false,
        reason: `Video length (${Math.round(durationSeconds / 60)} min) exceeds the ${Math.round(MAX_SERVERLESS_DURATION_SEC / 60)}-minute processing limit. Longer videos cannot be processed in one run — trim the clip, or upload a shorter section (up to 3 hours).`,
        creditsRemaining: 999,
        plan: 'free_beta',
        isFreeTier: true,
      };
    }

    return {
      allowed: true,
      creditsRemaining: 999,
      plan: 'free_beta',
      isFreeTier: true,
    };
  }

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
    user = {
      id: userId || 'anonymous',
      email: 'creator@flowzoraclips.com',
      credits_remaining: 999,
      plan: 'free_beta',
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
export async function deductCredit(userId: string, videoJobId: string): Promise<number> {
  if (IS_COMPLETELY_FREE) {
    return 999;
  }

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
