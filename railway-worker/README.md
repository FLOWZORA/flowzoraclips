# FLOWZORA YouTube Audio Extraction Worker

Railway-hosted Docker worker that extracts YouTube audio using `yt-dlp` + `ffmpeg`.
This is the same architecture used by Opus Clip, Klap, and Captions.ai.

## Why this is needed

Vercel serverless functions run on **AWS datacenter IPs** that YouTube actively blocklists.
This worker runs on Railway's IP pool (less flagged) and uses `yt-dlp` — the only tool
the community actively maintains to keep pace with YouTube's anti-bot updates.

## Deploy to Railway

### 1. Create a new Railway project

```bash
# From the railway-worker directory
cd railway-worker
railway login
railway init
railway up
```

Or connect via Railway dashboard → New Project → Deploy from GitHub repo → select this folder.

### 2. Set environment variables in Railway dashboard

| Variable | Required | Description |
|---|---|---|
| `YOUTUBE_COOKIE` | Recommended | Your YouTube session cookies (Netscape format exported from browser). Bypasses age-gates and reduces bot detection. |
| `WORKER_SECRET_TOKEN` | Recommended | A random secret string. Set the same value in Vercel as `WORKER_SECRET_TOKEN`. |
| `EXTRACT_TIMEOUT_MS` | Optional | Per-extraction yt-dlp timeout. Defaults to `40000`. Keep it below the caller's 45s abort (see Timing budget). |
| `PORT` | Auto-set | Railway sets this automatically. |

### 3. Set in Vercel dashboard

| Variable | Value |
|---|---|
| `YOUTUBE_WORKER_URL` | This worker's deployment URL (e.g. `https://flowzora-yt-worker.railway.app`). **Not** `RAILWAY_WORKER_URL` — that one is already taken by the ffmpeg render worker and has no `/extract-audio` route. |
| `WORKER_SECRET_TOKEN` | Same value as set in Railway |

### 4. Test the worker

```bash
# Health check
curl https://your-worker.railway.app/health

# Test audio extraction
curl -X POST https://your-worker.railway.app/extract-audio \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  --output test.mp3

# Verify output
ls -lh test.mp3  # Should be > 100KB
```

## How it works

1. Vercel Next.js API calls `POST /extract-audio` on this worker
2. Worker spawns `yt-dlp` which downloads + converts audio to 64kbps MP3
3. Raw MP3 bytes stream back to Vercel
4. Vercel passes audio buffer to Groq Whisper for transcription

## Timing budget

The whole request must fit inside Vercel's 60s function ceiling, and these
limits are nested deliberately:

| Stage | Limit | Where |
|---|---|---|
| Vercel function ceiling | 60s | `maxDuration` in `src/app/api/ingest/youtube/route.ts` |
| Route hard wall | 55s | `ROUTE_TIMEOUT_MS`, same file |
| Extraction (all strategies) | 50s | `EXTRACTION_GLOBAL_TIMEOUT_MS` in `src/lib/pipeline/youtube.ts` |
| Worker fetch abort | 45s | `AbortSignal.timeout` on the worker call |
| **This worker's yt-dlp run** | **40s** | `EXTRACT_TIMEOUT_MS` here |

Note that transcription (Groq) and ranking (Gemini) still have to run *after*
extraction returns. A worker that genuinely takes 40s leaves only ~15s for
those, so long videos can still time out at the route level even when
extraction succeeds. If that shows up in practice, the fix is to move
transcription behind a job queue rather than to raise these numbers.

## Cookie format

Export cookies from your browser using the "Get cookies.txt LOCALLY" Chrome extension.
The file will be in Netscape format — paste the entire content as `YOUTUBE_COOKIE` env var.
