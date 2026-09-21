-- ==============================================================================
-- FLOWZORA Clips — Background job queue support (3-hour videos)
-- Migration: 20260921_job_queue.sql
--
-- Extends public.jobs (created in 20260916_initial_schema.sql) with the fields
-- the Inngest background pipeline needs: progress reporting, a human-readable
-- stage, the R2 key of the finished result JSON, and the input context.
-- Apply in the Supabase dashboard (SQL editor) or via the Supabase CLI.
-- ==============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_detail TEXT,
  ADD COLUMN IF NOT EXISTS result_key TEXT,
  ADD COLUMN IF NOT EXISTS source_filename TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS script_preference TEXT;

-- Allow the queue's intermediate stages alongside the original ones.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_status_check CHECK (status IN (
    'pending', 'extracting', 'transcribing', 'scoring', 'rendering', 'completed', 'failed'
  ));

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);
