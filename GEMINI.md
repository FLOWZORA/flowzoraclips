# FLOWZORA Clips (flowzoraclips.com) — Engineering & Project Guide

**FLOWZORA Clips** takes long-form video/podcasts (Hindi, Hinglish, English) and automatically produces ranked, ready-to-post vertical short clips without manual scrubbing.

- **Brand:** Sub-brand of FLOWZORA (AI consulting practice).
- **Primary Wedge:** Genuine Hindi/Hinglish transcription accuracy + transparent highlight *ranking* (score, dedupe, rank best-first) — not naive fixed-interval chunking (Clipzi's limitation), and not face-only reframing (Vizard.ai's limitation).
- **Target Audience:** Solo & small Hindi/Hinglish podcasters, YouTubers, talk-show creators + English-language creators.
- **AI Scoring Engine:** Powered by **Google Gemini** (Gemini 2.5 Flash / Pro) via Gemini API for structured, multi-dimensional candidate scoring.

---

## 1. Locked Technology Stack

| Layer | Choice | Rationale & Rules |
|---|---|---|
| **Frontend** | Next.js (App Router) + Tailwind CSS | React Server Components (RSC) for crawlable pricing & SEO; Client components for interactive tools. |
| **Hosting & Edge** | Vercel / Cloudflare | Global low latency, edge & serverless compute. |
| **Interactive UI** | React (`'use client'`) | Dynamic client components (upload widget, waveform preview, trim nudger). |
| **Auth & Database** | Supabase (PostgreSQL) | Magic link email auth; credit ledger; job tracking. |
| **File Storage** | Cloudflare R2 | Zero-egress-fee storage for raw source videos and exported clips. |
| **Job Queue** | Inngest or Trigger.dev | Asynchronous background pipeline with polling/event updates. |
| **Transcription** | OpenAI Whisper API | Word-level timestamps & diarization. (Validated in Step 0 benchmark). |
| **Highlight Scoring** | Google Gemini (2.5 Flash / Pro) | Structured JSON scoring across 4 dimensions + 1-line reasoning string. |
| **Video Rendering** | Railway worker with FFmpeg | Offloaded video processing, 9:16 scene-aware cropping & caption burning. |
| **Payments** | Stripe | One-off credit top-ups; no forced subscription on v1. |

---

## 2. Processing Pipeline Stages

1. **Ingestion:** Upload (MP4/MOV/MP3/WAV) or YouTube URL. Configurable duration cap (10 min free). Language selection (Hindi / Hinglish / English / Auto) & script preference (Devanagari vs. Romanized Latin).
2. **Transcription:** Word-level timestamps with multi-speaker diarization.
3. **Filler-Word Flagging:** Word-timestamp detection of English (`um`, `uh`, `like`) and Hindi/Hinglish (`मतलब`, `यार`, `तो`, `actually`, `basically`) fillers for optional trimming.
4. **Candidate Generation:** Sliding-window segments (30–90s, ~15s stride) aligned to natural semantic sentence/topic boundaries (NEVER fixed time slices).
5. **Scoring (Gemini API):** Multi-dimensional scoring (Hook Strength 0-10, Standalone Coherence 0-10, Emotional Payoff 0-10, Trend Alignment 0-10) with strict JSON output and transparent reasoning text.
6. **Selection & Ranking:** Overlap deduplication, ranked best-first, returning a quality-driven natural count (e.g. 6–8 clips from 45 min, not an artificial quota).
7. **Scene-Aware Reframe (9:16):** Active speaker tracking with graceful fallback (center-crop / last-good frame) for slides, cutaways, and b-roll.
8. **Animated Captions:** Word-level animated captions rendered in Devanagari or Romanized script with proper font ligatures.
9. **Export & Review:** Interactive start/end nudge, ranked scorecard, multi-aspect export (9:16 primary, 1:1, 16:9).

---

## 3. Critical Architectural & Product Rules

### Rule A: Step 0 Benchmark Gate
Do not build the live transcription→scoring pipeline until the Step 0 benchmark is completed across OpenAI Whisper, Google Cloud Speech (Chirp), and AssemblyAI on real Hindi/Hinglish audio samples.

### Rule B: Crawlable Server-Rendered Pricing
**Pricing must be rendered as plain, crawlable HTML/text — NEVER injected via client-only JavaScript.**
In Next.js App Router, pricing pages and tables must be React Server Components (RSC) so crawlers and AI answer engines (Perplexity, ChatGPT, Gemini Search) find plain numerical prices in the raw server response without executing client hydration scripts.

### Rule C: Design Principles — Avoid Generic AI-SaaS Clichés
- **No generic templates:** Avoid warm-cream + terracotta or dark + acid-green clichés; avoid uniform rounded cards with soft grey shadows; avoid ALL-CAPS eyebrow labels with middle dots on every section.
- **Grounding in Indian Creator Culture:** High-contrast, bold, energetic color-blocking (deep onyx `#0A0B10`, vibrant saffron-orange `#FF5722`, electric gold `#FFB800`, crisp white `#FFFFFF`).
- **Bilingual Typography:** Must test and ensure proper rendering of Devanagari script alongside Latin text without broken font ligatures.
- **Hero-First Layout:** The upload/job tool is front-and-center above the fold (modeled after `rawtocookedcalculator.com`), not buried below promotional marketing copy.
- **Single Orchestrated Motion:** Reserve motion for the core product moment (timeline collapsing into ranked clips).

### Rule D: Abuse & Cost Protection
- Rate limit by account, IP, and client fingerprint.
- Server-side hard cap on free-tier video length (≤10 min) and monthly allotment (2 videos/month).
- Spend kill switch: When aggregate monthly AI/transcription spend crosses budget ceiling, gracefully pause free-tier jobs.
- Provider-side spend caps configured in Google AI Studio / Anthropic / OpenAI consoles.

---

## 4. Development Commands

```bash
# Start local dev server
npm run dev

# Build production bundle
npm run build

# Start production server
npm run start

# Run Step 0 Benchmark
node scripts/benchmark/benchmark-runner.mjs
```
