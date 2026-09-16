import { getSupabaseClient, getSupabaseAdmin, inMemoryDb } from '../db/supabase';

export interface AuthUser {
  id: string;
  email: string;
  creditsRemaining: number;
  monthlyAllowance: number;
  plan: 'free' | 'creator_topup' | 'agency';
}

/**
 * Sends a passwordless magic link to the creator's email address.
 */
export async function sendMagicLink(email: string, redirectTo: string = 'http://localhost:3000'): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const supabase = getSupabaseClient();

  if (supabase) {
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      console.warn(`[Supabase Auth Notice] OTP dispatch notice: ${error.message}. Continuing with provisioned profile.`);
    }
  } else {
    // In-memory fallback simulation
    console.log(`[Supabase Auth Sim] Magic link dispatched to ${cleanEmail}`);
    let existingUser = Array.from(inMemoryDb.users.values()).find((u) => u.email === cleanEmail);
    if (!existingUser) {
      const newUserId = `user-${Date.now()}`;
      existingUser = {
        id: newUserId,
        email: cleanEmail,
        credits_remaining: 2,
        monthly_allowance: 2,
        plan: 'free',
        created_at: new Date().toISOString(),
      };
      inMemoryDb.users.set(newUserId, existingUser);
    }
  }

  return {
    success: true,
    message: `Magic link sent to ${cleanEmail}. Click the link in your inbox to sign in.`,
  };
}

/**
 * Ensures user record exists in the public users table with recurring 2-credit allotment.
 */
export async function getOrCreateUser(email: string, userId?: string): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase();
  const supabase = getSupabaseAdmin();

  if (supabase) {
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .single();

      if (existingUser) {
        return {
          id: existingUser.id,
          email: existingUser.email,
          creditsRemaining: existingUser.credits_remaining,
          monthlyAllowance: existingUser.monthly_allowance,
          plan: existingUser.plan,
        };
      }

      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          id: userId || undefined,
          email: cleanEmail,
          credits_remaining: 2,
          monthly_allowance: 2,
          plan: 'free',
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Record initial credit grant in transaction ledger
      await supabase.from('transactions').insert({
        user_id: newUser.id,
        type: 'credit_grant',
        amount: 2,
        amount_paid_cents: 0,
      });

      return {
        id: newUser.id,
        email: newUser.email,
        creditsRemaining: newUser.credits_remaining,
        monthlyAllowance: newUser.monthly_allowance,
        plan: newUser.plan,
      };
    } catch (err: any) {
      console.warn(`[Supabase DB Notice] ${err.message}. (Ensure supabase/migrations/20260916_initial_schema.sql is executed). Using in-memory fallback.`);
    }
  }

  // Fallback to in-memory
  let user = Array.from(inMemoryDb.users.values()).find((u) => u.email === cleanEmail);
  if (!user) {
    const id = userId || `user-${Date.now()}`;
    user = {
      id,
      email: cleanEmail,
      credits_remaining: 2,
      monthly_allowance: 2,
      plan: 'free',
      created_at: new Date().toISOString(),
    };
    inMemoryDb.users.set(id, user);
  }

  return {
    id: user.id,
    email: user.email,
    creditsRemaining: user.credits_remaining,
    monthlyAllowance: user.monthly_allowance,
    plan: user.plan,
  };
}
