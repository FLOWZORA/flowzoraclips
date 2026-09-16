import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const execAsync = promisify(exec);

const PORT = process.env.PORT || 8080;
const WORKER_SECRET_TOKEN = process.env.WORKER_SECRET_TOKEN || 'flowzora-secret';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'flowzora-clips';
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || 'https://r2.flowzoraclips.com';

function getS3Client() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null;
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health check endpoint
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'healthy', worker: 'flowzora-ffmpeg-worker' }));
  }

  // Render job endpoint
  if (req.method === 'POST' && url.pathname === '/render') {
    // Authenticate bearer token
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${WORKER_SECRET_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: invalid worker token' }));
    }

    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });

    req.on('end', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowzora-render-'));

      try {
        const payload = JSON.parse(rawBody);
        const {
          clipId = `clip-${Date.now()}`,
          sourceVideoUrl,
          startTime = 0,
          endTime = 30,
          speakerXCenter = 708,
          subtitleStream = '',
          outputFormat = '9:16',
          r2BucketKey,
        } = payload;

        console.log(`[Worker] Starting render job for clip: ${clipId} (${outputFormat})`);
        const startTimeMs = Date.now();

        // 1. Write subtitle file (.ass)
        const subFilePath = path.join(tempDir, `subtitles_${clipId}.ass`);
        await fs.writeFile(subFilePath, subtitleStream, 'utf8');

        // 2. Output MP4 file path
        const outputMp4Path = path.join(tempDir, `output_${clipId}.mp4`);

        // 3. Build FFmpeg command with crop and burned subtitles
        let filterChain = `crop=608:1080:${speakerXCenter}:0,scale=1080:1920`;
        if (outputFormat === '1:1') {
          filterChain = `crop=1080:1080:420:0`;
        } else if (outputFormat === '16:9') {
          filterChain = `scale=1920:1080`;
        }

        const safeSubPath = subFilePath.replace(/\\/g, '/').replace(/:/g, '\\:');
        filterChain += `,ass='${safeSubPath}'`;

        const ffmpegCmd = `ffmpeg -y -ss ${startTime} -to ${endTime} -i "${sourceVideoUrl}" -vf "${filterChain}" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -movflags +faststart "${outputMp4Path}"`;

        console.log(`[Worker] Executing: ${ffmpegCmd}`);
        await execAsync(ffmpegCmd);

        // 4. Read rendered video
        const renderedBuffer = await fs.readFile(outputMp4Path);
        const renderTimeSec = Math.round((Date.now() - startTimeMs) / 1000);

        // 5. Upload finished MP4 directly to Cloudflare R2
        const s3 = getS3Client();
        const targetKey = r2BucketKey || `exports/${clipId}_${outputFormat.replace(':', 'x')}.mp4`;
        let publicDownloadUrl = `${R2_PUBLIC_DOMAIN}/${targetKey}`;

        if (s3) {
          await s3.send(
            new PutObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: targetKey,
              Body: renderedBuffer,
              ContentType: 'video/mp4',
            })
          );
          console.log(`[Worker] Successfully uploaded rendered clip to R2: ${targetKey}`);
        } else {
          console.log(`[Worker] S3 credentials not set, rendered locally (${renderedBuffer.length} bytes)`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            success: true,
            clipId,
            format: outputFormat,
            fileKey: targetKey,
            downloadUrl: publicDownloadUrl,
            renderTimeSec,
          })
        );
      } catch (err) {
        console.error('[Worker] Render execution failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        // Clean up temp directory
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (_) {}
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`[FLOWZORA Clips] FFmpeg Worker active on port ${PORT}`);
});
