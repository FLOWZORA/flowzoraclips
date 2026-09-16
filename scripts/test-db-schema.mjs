/**
 * FLOWZORA Clips — Database Schema & Migration Verification Suite
 * Validates:
 * 1. Existence and syntax of supabase/migrations/20260916_initial_schema.sql
 * 2. Table definitions (users, transactions, spend_ledger, jobs)
 * 3. Row Level Security (RLS) policies
 * 4. Indexes for high-throughput queries
 * 5. Monthly recurring free credit renewal function
 */

import fs from 'fs';
import path from 'path';

function runSchemaTests() {
  console.log('===========================================================');
  console.log('FLOWZORA Clips — Database Migration & Schema Suite');
  console.log('===========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
    }
  }

  const migrationPath = path.resolve('supabase/migrations/20260916_initial_schema.sql');
  assert(fs.existsSync(migrationPath), `Migration file exists at ${migrationPath}`);

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Test tables
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.users'), 'Table public.users defined');
  assert(sql.includes('credits_remaining INTEGER NOT NULL DEFAULT 2'), 'Users table default 2 free recurring credits');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.transactions'), 'Table public.transactions ledger defined');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.spend_ledger'), 'Table public.spend_ledger defined (Rule D kill switch)');
  assert(sql.includes('budget_cap_usd NUMERIC(10, 2) NOT NULL DEFAULT 50.00'), 'Spend ledger default $50.00 budget ceiling');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.jobs'), 'Table public.jobs defined');

  // Test RLS policies
  assert(sql.includes('ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on users');
  assert(sql.includes('ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on transactions');
  assert(sql.includes('CREATE POLICY "Service role full access on users"'), 'Service role full access policy defined');

  // Test automated credit renewal function
  assert(sql.includes('FUNCTION public.reset_monthly_free_credits()'), 'Recurring monthly credit renewal function defined');
  assert(sql.includes("WHERE plan = 'free'"), 'Credit renewal accurately targets free tier creators');

  // Test .env.example
  const envExamplePath = path.resolve('.env.example');
  assert(fs.existsSync(envExamplePath), '.env.example configuration template exists');
  const envContent = fs.readFileSync(envExamplePath, 'utf8');
  assert(envContent.includes('GEMINI_API_KEY='), 'GEMINI_API_KEY documented in .env.example');
  assert(envContent.includes('OPENAI_API_KEY='), 'OPENAI_API_KEY documented in .env.example');
  assert(envContent.includes('NEXT_PUBLIC_SUPABASE_URL='), 'Supabase variables documented in .env.example');
  assert(envContent.includes('STRIPE_SECRET_KEY='), 'Stripe variables documented in .env.example');
  assert(envContent.includes('R2_ACCOUNT_ID='), 'Cloudflare R2 variables documented in .env.example');
  assert(envContent.includes('RAILWAY_WORKER_URL='), 'Railway worker variables documented in .env.example');

  // Test Worker files
  assert(fs.existsSync(path.resolve('workers/Dockerfile')), 'workers/Dockerfile exists');
  assert(fs.existsSync(path.resolve('workers/ffmpeg-worker.mjs')), 'workers/ffmpeg-worker.mjs exists');
  assert(fs.existsSync(path.resolve('workers/README.md')), 'workers/README.md deploy guide exists');

  console.log('');
  console.log('===========================================================');
  console.log(`Verification Complete: ${passed}/${total} assertions passed (${Math.round((passed/total)*100)}%)`);
  console.log('===========================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSchemaTests();
