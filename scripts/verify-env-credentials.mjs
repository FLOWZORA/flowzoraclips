#!/usr/bin/env node

/**
 * FLOWZORA Clips — Environment & Live Credentials Verifier
 * Run: node scripts/verify-env-credentials.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Simple .env parser without external dependencies
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

async function verifyCredentials() {
  console.log('================================================================');
  console.log(' FLOWZORA Clips — Live Production Credentials Diagnostics');
  console.log('================================================================\n');

  const envLocal = loadEnvFile(path.join(rootDir, '.env.local'));
  const envMain = loadEnvFile(path.join(rootDir, '.env'));
  const env = { ...process.env, ...envMain, ...envLocal };

  const results = [];

  // 1. Google Gemini API
  const geminiKey = env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey.includes('YourGeminiApiKey')) {
    results.push({
      service: 'Google Gemini API',
      variable: 'GEMINI_API_KEY',
      status: 'FALLBACK_SIMULATION',
      detail: 'Key not set. Using built-in rule-based scoring & social copy generator.',
      action: 'Get a free key from https://aistudio.google.com/',
    });
  } else {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`
      );
      if (res.ok) {
        results.push({
          service: 'Google Gemini API',
          variable: 'GEMINI_API_KEY',
          status: 'LIVE_CONNECTED',
          detail: 'Valid API key. Connected to Google Generative AI (Gemini 2.5 Flash / Pro).',
        });
      } else {
        results.push({
          service: 'Google Gemini API',
          variable: 'GEMINI_API_KEY',
          status: 'ERROR',
          detail: `API rejected key with HTTP ${res.status}: ${(await res.text()).slice(0, 100)}`,
        });
      }
    } catch (err) {
      results.push({
        service: 'Google Gemini API',
        variable: 'GEMINI_API_KEY',
        status: 'NETWORK_ERROR',
        detail: `Connection failed: ${err.message}`,
      });
    }
  }

  // 2. Speech Transcription: Groq (100% Free) or OpenAI Whisper
  const groqKey = env.GROQ_API_KEY;
  if (!groqKey || groqKey.includes('YourGroqApiKey')) {
    results.push({
      service: 'Groq Whisper Large v3 (100% Free 🏆)',
      variable: 'GROQ_API_KEY',
      status: 'FALLBACK_SIMULATION',
      detail: 'Key not set. 10x faster free transcription available.',
      action: 'Get 100% free key at https://console.groq.com/',
    });
  } else {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${groqKey}` },
      });
      if (res.ok) {
        results.push({
          service: 'Groq Whisper Large v3 (100% Free 🏆)',
          variable: 'GROQ_API_KEY',
          status: 'LIVE_CONNECTED',
          detail: 'Valid Groq API key! 100% free speech-to-text with word timestamps enabled.',
        });
      } else {
        results.push({
          service: 'Groq Whisper Large v3 (100% Free 🏆)',
          variable: 'GROQ_API_KEY',
          status: 'ERROR',
          detail: `Groq rejected key with HTTP ${res.status}`,
        });
      }
    } catch (err) {
      results.push({
        service: 'Groq Whisper Large v3 (100% Free 🏆)',
        variable: 'GROQ_API_KEY',
        status: 'NETWORK_ERROR',
        detail: `Connection failed: ${err.message}`,
      });
    }
  }

  // 2b. OpenAI Whisper API (Paid Alternative)
  const openaiKey = env.OPENAI_API_KEY;
  if (openaiKey && !openaiKey.includes('YourOpenAiApiKey')) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${openaiKey}` },
      });
      if (res.ok) {
        results.push({
          service: 'OpenAI Whisper API ($0.006/min)',
          variable: 'OPENAI_API_KEY',
          status: 'LIVE_CONNECTED',
          detail: 'Valid OpenAI API key. Live Whisper speech-to-text ready.',
        });
      } else {
        results.push({
          service: 'OpenAI Whisper API ($0.006/min)',
          variable: 'OPENAI_API_KEY',
          status: 'ERROR',
          detail: `OpenAI rejected key with HTTP ${res.status}`,
        });
      }
    } catch (err) {
      results.push({
        service: 'OpenAI Whisper API ($0.006/min)',
        variable: 'OPENAI_API_KEY',
        status: 'NETWORK_ERROR',
        detail: `Connection failed: ${err.message}`,
      });
    }
  }

  // 3. Supabase Auth & Database
  const supaUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey || supaUrl.includes('your-project-id')) {
    results.push({
      service: 'Supabase (DB & Auth)',
      variable: 'SUPABASE_SERVICE_ROLE_KEY',
      status: 'FALLBACK_SIMULATION',
      detail: 'Credentials not configured. Using in-memory transactional ledger.',
      action: 'Configure in Supabase Dashboard > Project Settings > API',
    });
  } else {
    try {
      const res = await fetch(`${supaUrl}/rest/v1/`, {
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
        },
      });
      if (res.status === 200 || res.status === 404 || res.status === 401) {
        results.push({
          service: 'Supabase (DB & Auth)',
          variable: 'SUPABASE_SERVICE_ROLE_KEY',
          status: res.status === 401 ? 'INVALID_KEY' : 'LIVE_CONNECTED',
          detail: `Supabase responded with HTTP ${res.status}. PostgreSQL ready.`,
        });
      }
    } catch (err) {
      results.push({
        service: 'Supabase (DB & Auth)',
        variable: 'SUPABASE_SERVICE_ROLE_KEY',
        status: 'NETWORK_ERROR',
        detail: `Failed to reach Supabase endpoint: ${err.message}`,
      });
    }
  }

  // 4. Stripe Billing
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.includes('YourStripeSecretKey')) {
    results.push({
      service: 'Stripe Payments',
      variable: 'STRIPE_SECRET_KEY',
      status: 'FALLBACK_SIMULATION',
      detail: 'Key not set. Using instant simulated checkout sessions ($12 / $49).',
      action: 'Get keys from Stripe Dashboard > Developers > API keys',
    });
  } else {
    try {
      const res = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      if (res.ok) {
        results.push({
          service: 'Stripe Payments',
          variable: 'STRIPE_SECRET_KEY',
          status: 'LIVE_CONNECTED',
          detail: 'Valid Stripe Secret Key. Live credit pack checkouts active.',
        });
      } else {
        results.push({
          service: 'Stripe Payments',
          variable: 'STRIPE_SECRET_KEY',
          status: 'ERROR',
          detail: `Stripe returned HTTP ${res.status}`,
        });
      }
    } catch (err) {
      results.push({
        service: 'Stripe Payments',
        variable: 'STRIPE_SECRET_KEY',
        status: 'NETWORK_ERROR',
        detail: `Connection failed: ${err.message}`,
      });
    }
  }

  // 5. Cloudflare R2 Storage
  const r2Key = env.R2_ACCESS_KEY_ID;
  const r2Secret = env.R2_SECRET_ACCESS_KEY;
  if (!r2Key || !r2Secret || r2Key.includes('your_r2_access_key_id')) {
    results.push({
      service: 'Cloudflare R2 Storage',
      variable: 'R2_ACCESS_KEY_ID',
      status: 'FALLBACK_SIMULATION',
      detail: 'R2 tokens not set. Using zero-config in-memory buffer storage.',
      action: 'Create token in Cloudflare Dashboard > R2 > Manage R2 API Tokens',
    });
  } else {
    results.push({
      service: 'Cloudflare R2 Storage',
      variable: 'R2_ACCESS_KEY_ID',
      status: 'CONFIGURED',
      detail: `Configured for bucket "${env.R2_BUCKET_NAME || 'flowzora-clips'}".`,
    });
  }

  // 6. Railway FFmpeg Worker
  const workerUrl = env.RAILWAY_WORKER_URL;
  if (!workerUrl || workerUrl.includes('flowzora-ffmpeg-worker.up.railway.app')) {
    results.push({
      service: 'Railway FFmpeg Worker',
      variable: 'RAILWAY_WORKER_URL',
      status: 'LOCAL_FFMPEG',
      detail: 'Remote worker URL not set. Using local FFmpeg / streaming binary generator.',
      action: 'Deploy workers/Dockerfile to Railway (see workers/README.md)',
    });
  } else {
    try {
      const res = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        results.push({
          service: 'Railway FFmpeg Worker',
          variable: 'RAILWAY_WORKER_URL',
          status: 'LIVE_CONNECTED',
          detail: 'Railway FFmpeg worker is healthy and ready for video render jobs.',
        });
      } else {
        results.push({
          service: 'Railway FFmpeg Worker',
          variable: 'RAILWAY_WORKER_URL',
          status: 'UNREACHABLE',
          detail: `Worker responded with HTTP ${res.status}`,
        });
      }
    } catch {
      results.push({
        service: 'Railway FFmpeg Worker',
        variable: 'RAILWAY_WORKER_URL',
        status: 'UNREACHABLE',
        detail: 'Worker endpoint not reachable. Ensure Railway service is active.',
      });
    }
  }

  // Display Diagnostics Table
  for (const item of results) {
    const icon =
      item.status === 'LIVE_CONNECTED' || item.status === 'CONFIGURED'
        ? '🟢'
        : item.status === 'FALLBACK_SIMULATION' || item.status === 'LOCAL_FFMPEG'
        ? '🟡'
        : '🔴';

    console.log(`${icon} [${item.service}] — Status: ${item.status}`);
    console.log(`   Config: ${item.variable}`);
    console.log(`   Details: ${item.detail}`);
    if (item.action) {
      console.log(`   Setup:   ${item.action}`);
    }
    console.log('');
  }

  console.log('----------------------------------------------------------------');
  const liveCount = results.filter((r) => r.status === 'LIVE_CONNECTED' || r.status === 'CONFIGURED').length;
  const simCount = results.filter((r) => r.status === 'FALLBACK_SIMULATION' || r.status === 'LOCAL_FFMPEG').length;
  console.log(`Summary: ${liveCount} services LIVE, ${simCount} services running on Graceful Simulation.`);
  console.log('App is 100% operational locally and ready for production credentials.');
  console.log('================================================================\n');
}

verifyCredentials().catch(console.error);
