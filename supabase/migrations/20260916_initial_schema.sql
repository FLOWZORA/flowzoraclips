-- ==============================================================================
-- FLOWZORA Clips (flowzoraclips.com) — Initial Supabase PostgreSQL Schema
-- Migration: 20260916_initial_schema.sql
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  credits_remaining INTEGER NOT NULL DEFAULT 2,
  monthly_allowance INTEGER NOT NULL DEFAULT 2,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'creator_topup', 'agency')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index on email for fast lookups during magic link authentication
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- ------------------------------------------------------------------------------
-- 2. TRANSACTIONS LEDGER TABLE (Credit Grants & Top-Ups)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit_grant', 'usage_deduction', 'top_up_purchase', 'failure_refund')),
  amount INTEGER NOT NULL,
  stripe_ref TEXT,
  amount_paid_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at);

-- ------------------------------------------------------------------------------
-- 3. MONTHLY SPEND LEDGER TABLE (Rule D: Budget Kill Switch)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spend_ledger (
  month_key TEXT PRIMARY KEY, -- Format: 'YYYY-MM'
  total_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  budget_cap_usd NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'capped')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 4. JOINS & PROCESSING JOBS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'file' CHECK (source_type IN ('file', 'youtube')),
  duration_sec NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transcribing', 'scoring', 'rendering', 'completed', 'failed')),
  error_message TEXT,
  ranked_clips JSONB,
  storage_keys JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spend_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Users can read their own transactions
CREATE POLICY "Users can read own transactions"
  ON public.transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can read their own jobs
CREATE POLICY "Users can read own jobs"
  ON public.jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role has full unrestricted admin access (bypasses RLS)
CREATE POLICY "Service role full access on users"
  ON public.users
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on transactions"
  ON public.transactions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on spend_ledger"
  ON public.spend_ledger
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on jobs"
  ON public.jobs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ------------------------------------------------------------------------------
-- 6. AUTOMATED MONTHLY FREE CREDIT RENEWAL
-- ------------------------------------------------------------------------------
-- Resets free users' credits to their monthly allowance (2 credits)
CREATE OR REPLACE FUNCTION public.reset_monthly_free_credits()
RETURNS void AS $$
BEGIN
  -- Renew credits for all active free-tier accounts
  UPDATE public.users
  SET
    credits_remaining = monthly_allowance,
    updated_at = timezone('utc'::text, now())
  WHERE plan = 'free';

  -- Record credit renewal in transactions ledger
  INSERT INTO public.transactions (user_id, type, amount, amount_paid_cents)
  SELECT id, 'credit_grant', monthly_allowance, 0
  FROM public.users
  WHERE plan = 'free';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule renewal function to run on the 1st of every month via pg_cron (if extension enabled)
-- SELECT cron.schedule('reset-monthly-credits', '0 0 1 * *', 'SELECT public.reset_monthly_free_credits()');
