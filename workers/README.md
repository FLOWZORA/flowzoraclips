# FLOWZORA Clips — Railway FFmpeg Video Rendering Worker

This directory contains the production-grade **FFmpeg Video Rendering Worker** for FLOWZORA Clips. It handles asynchronous video trimming, active speaker scene-aware 9:16 cropping, dual-script `.ass` animated subtitle burning (with native Devanagari ligatures), and direct zero-egress uploads to Cloudflare R2.

---

## 1. Quick Deploy to Railway (Recommended)

1. Fork or push this repository to GitHub.
2. In the [Railway Dashboard](https://railway.com/):
   - Click **New Project** > **Deploy from GitHub repo**.
   - Select your `flowzoraclips.com` repository.
   - Set **Root Directory** to `/workers`.
3. Configure the following **Environment Variables** in Railway:

| Variable | Description | Example |
|---|---|---|
| `PORT` | Listening HTTP port | `8080` |
| `WORKER_SECRET_TOKEN` | Bearer token matching `WORKER_SECRET_TOKEN` in your Next.js app | `your_secret_worker_token` |
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `your_cloudflare_account_id` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 S3 API Access Key | `your_r2_access_key` |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 S3 API Secret Key | `your_r2_secret_key` |
| `R2_BUCKET_NAME` | R2 Bucket Name | `flowzora-clips` |
| `R2_PUBLIC_DOMAIN` | Custom R2 domain or r2.dev domain | `https://r2.flowzoraclips.com` |

4. In your **Next.js app environment** (Vercel / Cloudflare), set:
   ```bash
   RAILWAY_WORKER_URL=https://your-worker-service.up.railway.app
   WORKER_SECRET_TOKEN=your_secret_worker_token
   ```

---

## 2. Running Locally with Docker

To test the worker locally with containerized FFmpeg:

```bash
# Build the Docker image
docker build -t flowzora-ffmpeg-worker ./workers

# Run the container on port 8080
docker run -p 8080:8080 \
  -e WORKER_SECRET_TOKEN=flowzora-secret \
  flowzora-ffmpeg-worker
```

Verify health:
```bash
curl http://localhost:8080/health
# Response: {"status":"healthy","worker":"flowzora-ffmpeg-worker"}
```

---

## 3. Worker API Endpoints

### `GET /health`
Returns worker health status.

### `POST /render`
Receives an FFmpeg render payload:
```json
{
  "clipId": "clip-burnout-01",
  "sourceVideoUrl": "https://r2.flowzoraclips.com/raw/episode-42.mp4",
  "startTime": 15.0,
  "endTime": 65.0,
  "speakerXCenter": 708,
  "subtitleStream": "[Script Info]...",
  "outputFormat": "9:16",
  "r2BucketKey": "exports/clip-burnout-01_9x16.mp4"
}
```

**Headers:**
`Authorization: Bearer <WORKER_SECRET_TOKEN>`

**Response:**
```json
{
  "success": true,
  "clipId": "clip-burnout-01",
  "format": "9:16",
  "fileKey": "exports/clip-burnout-01_9x16.mp4",
  "downloadUrl": "https://r2.flowzoraclips.com/exports/clip-burnout-01_9x16.mp4",
  "renderTimeSec": 12
}
```
