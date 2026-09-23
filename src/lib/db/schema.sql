-- FLOWZORA Clips Database Schema (PostgreSQL / Supabase)

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    credits_remaining INTEGER NOT NULL DEFAULT 2, -- Monthly recurring allotment
    monthly_allowance INTEGER NOT NULL DEFAULT 2,
    plan TEXT NOT NULL DEFAULT 'free',           -- 'free', 'creator_topup', 'agency'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Videos Table
CREATE TABLE IF NOT EXISTS public.videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT,
    source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'youtube')),
    source_url TEXT,
    source_r2_key TEXT,
    language TEXT NOT NULL DEFAULT 'hinglish' CHECK (language IN ('hindi', 'hinglish', 'english', 'auto')),
    script_preference TEXT NOT NULL DEFAULT 'romanized' CHECK (script_preference IN ('devanagari', 'romanized', 'english')),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Jobs Table
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
    stage TEXT NOT NULL DEFAULT 'transcribing' CHECK (
        stage IN ('transcribing', 'detecting_fillers', 'generating_candidates', 'scoring', 'reframing', 'captioning', 'done', 'failed')
    ),
    cost_accrued NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Clips Table (Ranked Moments)
CREATE TABLE IF NOT EXISTS public.clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
    start_time NUMERIC(8, 2) NOT NULL,
    end_time NUMERIC(8, 2) NOT NULL,
    duration NUMERIC(8, 2) NOT NULL,
    score_json JSONB NOT NULL,                 -- { hookStrength, standaloneCoherence, emotionalPayoff, topicTrendAlignment, compositeScore }
    reasoning_text TEXT NOT NULL,              -- 1-line transparent explanation
    rank INTEGER NOT NULL,
    aspect_ratio TEXT NOT NULL DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16', '1:1', '16:9')),
    reframe_fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
    output_url TEXT,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Transactions Table (Credits & Stripe top-ups)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('credit_grant', 'top_up_purchase', 'usage_deduction')),
    amount INTEGER NOT NULL,                   -- positive for purchase/grant, negative for usage
    stripe_session_id TEXT,
    amount_paid_cents INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Spend Ledger (Enforces Monthly Kill Switch)
CREATE TABLE IF NOT EXISTS public.spend_ledger (
    month_key VARCHAR(7) PRIMARY KEY,          -- Format: 'YYYY-MM'
    total_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    budget_cap_usd NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'capped')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. API Usage Ledger (estimate-based daily quota tracking)
-- One row per billable provider call. Read back as "used today" and
-- subtracted from each provider's documented free-tier daily cap.
-- Resets are logical (created_at >= midnight PT), never deletions.
CREATE TABLE IF NOT EXISTS public.api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('cloudflare', 'groq-transcribe', 'openai-transcribe', 'gemini', 'groq-scoring')),
    kind TEXT NOT NULL CHECK (kind IN ('audio-min', 'request', 'token')),
    amount NUMERIC(12, 4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create Indexes for Fast Queries
CREATE INDEX IF NOT EXISTS idx_api_usage_day ON public.api_usage(provider, kind, created_at);
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON public.videos(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_video_id ON public.clips(video_id);
CREATE INDEX IF NOT EXISTS idx_clips_rank ON public.clips(video_id, rank);
CREATE INDEX IF NOT EXISTS idx_jobs_video_id ON public.jobs(video_id);
