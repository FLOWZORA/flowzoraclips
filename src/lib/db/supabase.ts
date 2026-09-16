import { createClient, SupabaseClient } from '@supabase/supabase-js';

// In-memory fallback database for local development and testing when Supabase keys are not set
class InMemoryDatabase {
  users = new Map<string, any>();
  videos = new Map<string, any>();
  jobs = new Map<string, any>();
  transactions = new Map<string, any>();
  spendLedger = new Map<string, any>();

  constructor() {
    // Seed standard demo user
    this.users.set('demo-user-1', {
      id: 'demo-user-1',
      email: 'creator@flowzoraclips.com',
      credits_remaining: 2,
      monthly_allowance: 2,
      plan: 'free',
      last_renewal_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    const currentMonth = new Date().toISOString().slice(0, 7);
    this.spendLedger.set(currentMonth, {
      month_key: currentMonth,
      total_cost_usd: 1.42,
      budget_cap_usd: 50.0,
      status: 'open',
    });
  }
}

export const inMemoryDb = new InMemoryDatabase();

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anonKey);
  }

  return supabaseInstance;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey);
}
