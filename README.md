# FLOWZORA Clips — AI Short-Clip Engine for Podcasts (Hindi / Hinglish / English)

**Live product:** https://flowzoraclips.com
**What it does:** Upload a long-form podcast / YouTube video → get ranked, ready-to-post vertical (9:16) short clips with animated subtitles, without manual scrubbing.

Built as a production-grade full-stack AI SaaS — not a demo wrapper. Handles real ingestion, transcription, LLM scoring, ranking, reframing, captioning, background jobs, auth, credits, and payments.

---

## Why this project stands out

Most auto-clipping tools do naive fixed-interval chunking (every 30s) and fail on Hindi/Hinglish content.

FLOWZORA Clips does something harder:

1. **Semantic candidate generation** — sliding windows (30–90s) snapped to sentence/topic boundaries, never fixed time slices
2. **Transparent 4-dimension LLM scoring** — Hook Strength, Standalone Coherence, Emotional Payoff, Trend Alignment (0–10 each) via Google Gemini with strict JSON output + reasoning string
3. **Overlap deduplication + best-first ranking** — returns a quality-driven natural count (e.g. 6–8 clips from 45 min), not an artificial quota
4. **Hindi/Hinglish-first transcription** — word-level timestamps with Devanagari + Romanized caption support and proper font ligatures
5. **Scene-aware 9:16 reframe** — active-speaker tracking with graceful fallback for slides / b-roll

## Key features

- **Dual ingestion:** direct upload (MP4/MOV/MP3/WAV) + YouTube URL (yt-dlp worker + residential proxy fallback for datacenter IP blocks)
- **Multi-provider transcription with automatic fallback:** Cloudflare Workers AI Whisper (primary, free) → Groq Whisper Large v3 → OpenAI Whisper
- **Filler-word detection:** English (`um`, `uh`, `like`) + Hindi/Hinglish (`मतलब`, `यार`, `तो`, `actually`, `basically`)
- **Interactive review UI:** ranked scorecards, start/end nudging, waveform preview, multi-aspect export (9:16, 1:1, 16:9)
- **AI social copy generation:** Gemini-powered titles / hashtags / descriptions per clip
- **Background pipeline for long videos:** Inngest stepped jobs (one chunk per step, no serverless timeout) with live polling
- **Auth + billing:** Supabase magic-link auth, credit ledger, Stripe one-off top-ups + Razorpay webhook, spend kill-switch + rate limiting
- **SEO-first marketing pages:** React Server Components for crawlable pricing, sitemap + robots, FAQ structured for AI answer engines

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Geist |
| AI Scoring / Copy | Google Gemini 2.5 Flash/Pro (`@google/genai`) |
| Transcription | Cloudflare Workers AI Whisper, Groq Whisper, OpenAI Whisper |
| Background jobs | Inngest |
| Auth + Database | Supabase (PostgreSQL, magic-link) |
| Storage | Cloudflare R2 (S3-compatible, zero egress) |
| Video rendering | FFmpeg worker (Railway/Render) + client-side exporter |
| Payments | Stripe + Razorpay |
| Hosting | Vercel |

## Architecture

```
Upload / YouTube URL
  → /api/ingest + /api/upload/presigned-url (R2)
  → /api/pipeline/jobs (inline for short) or Inngest (long videos)
    1. audio-extractor / youtube.ts
    2. cloudflare-whisper → whisper → filler-detect
    3. candidate-generator (semantic windows)
    4. gemini-scorer (4-dim JSON) → ranker (dedupe + sort)
    5. reframe (9:16) + caption-renderer (Devanagari/Roman)
    6. video-exporter / render worker → R2_PUBLIC_DOMAIN
  → HeroUploader + ClipVideoPreview (review, nudge, export)
  → /api/pipeline/social-copy (titles/hashtags)
```

Relevant code: `src/lib/pipeline/`, `src/inngest/functions/process-video.ts`, `src/app/api/`

## Engineering highlights (for reviewers)

- **Cost-aware provider cascade** — free-tier-first transcription routing with per-provider daily quota tracking (`/api/usage`, `UsageTracker.tsx`) and a global `MONTHLY_BUDGET_CAP_USD` kill-switch that gracefully pauses free-tier jobs.
- **Abuse protection** — server-side duration caps (≤10 min free), monthly allotments, rate limiting by account/IP/fingerprint.
- **Deterministic LLM contract** — Gemini prompted for strict JSON with validation + retry, so scoring never breaks ranking on malformed output.
- **Long-video safe** — Inngest steps isolate transcription/scoring per chunk; inline fallback keeps local dev simple.
- **Bilingual correctness** — caption pipeline tested for Devanagari ligatures, script preference (Devanagari vs Romanized) plumbed end-to-end from ingestion to render.

## Getting started

Requirements: Node.js >= 22.12

```bash
npm install
cp .env.example .env.local  # fill in keys — see below
npm run dev    # http://localhost:3000
```

```bash
npm run build
npm start
```

### Environment variables

Copy `.env.example` → `.env.local`. Minimum for local pipeline:

- `GEMINI_API_KEY` — Google AI Studio
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` — primary transcription
- `GROQ_API_KEY` — fallback transcription (optional but recommended)
- `NEXT_PUBLIC_SUPABASE_URL` + keys — auth/db (app runs degraded without it)
- `R2_*` — storage (falls back to local in dev if unset)
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — only needed for 3-hour videos; otherwise jobs run inline
- `STRIPE_*` — only needed for billing

Full annotated list with obtain-links is in `.env.example`.

## Project structure

```
src/
  app/               # App Router pages + API routes (ingest, pipeline/jobs, export, billing, auth)
  components/        # HeroUploader, ClipVideoPreview, PricingTable, ScoringExplainer, etc.
  lib/
    pipeline/        # audio, whisper, candidates, gemini-scorer, ranker, reframe, captions, export
    billing/         # credits, stripe, razorpay, kill-switch
    auth/ db/ jobs/ storage/ usage/
  inngest/           # client + process-video stepped function
railway-worker/      # FFmpeg render worker
workers/             # YouTube audio worker (yt-dlp)
supabase/            # migrations / schema
scripts/benchmark/   # Step-0 transcription benchmark (Whisper vs Chirp vs AssemblyAI)
```

## Benchmark & product decisions

Before building the live pipeline, transcription providers were benchmarked on real Hindi/Hinglish samples (see `scripts/benchmark/benchmark-runner.mjs`). Result: Whisper-family word timestamps were the most reliable, hence the Cloudflare → Groq → OpenAI cascade.

Deliberate non-goals for v1: no forced subscriptions (credit top-ups only), no face-only reframing, no fixed-interval clipping.

## Status & roadmap

Live beta (free period, pricing UI temporarily disabled). Next: speaker diarization upgrade, auto-emoji captions, scheduled posting to YouTube Shorts / Instagram Reels.

## Author

Built by FLOWZORA (AI consulting practice) — flowzoraclips.com is its creator-tools sub-brand. Recruiter contact via the site's `/contact` page.
