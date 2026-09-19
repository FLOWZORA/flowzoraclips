import {
  validateProcessingEligibility,
  IS_COMPLETELY_FREE,
  MAX_PAID_VIDEO_DURATION_SEC,
  MAX_FREE_VIDEO_DURATION_SEC,
} from '../billing/credits';

export interface YouTubeVideoMetadata {
  videoId: string;
  url: string;
  title: string;
  author: string;
  durationSec: number;
  formattedDuration: string;
  thumbnailUrl: string;
  isEligibleForFreeTier: boolean;
}

/**
 * Parses and extracts the canonical video ID from any YouTube URL format:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://www.youtube.com/shorts/dQw4w9WgXcQ
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 */
export function parseYouTubeUrl(url: string): { videoId: string | null; isValid: boolean } {
  if (!url || typeof url !== 'string') {
    return { videoId: null, isValid: false };
  }

  const cleanUrl = url.trim();

  // Standard watch regex
  const watchRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i;
  const match = cleanUrl.match(watchRegex);

  if (match && match[1]) {
    return { videoId: match[1], isValid: true };
  }

  return { videoId: null, isValid: false };
}

/**
 * Formats duration in seconds to MM:SS or HH:MM:SS.
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Fetches YouTube video metadata with exact duration and high-res thumbnail.
 * Uses Innertube (pure JS) with fallback to official oEmbed.
 */
/**
 * Fetches YouTube video metadata with exact duration and high-res thumbnail.
 * Multi-layer resolver: VisionOS client -> Innertube -> Official oEmbed with browser headers.
 */
export async function getYouTubeMetadata(url: string, durationSecEstimate: number = 480): Promise<YouTubeVideoMetadata> {
  const { videoId, isValid } = parseYouTubeUrl(url);

  if (!isValid || !videoId) {
    throw new Error('Invalid YouTube URL. Please provide a link in the format https://youtube.com/watch?v=... or https://youtu.be/...');
  }

  let title = 'Hindi / Hinglish Creator Podcast Episode';
  let author = 'Indian Creator Studio';
  let durationSec = durationSecEstimate;
  let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // 1. Try VisionOS endpoint (bypasses age-gate and login-gate without account credentials)
  const visionMeta = await getMetadataViaVisionOS(videoId);
  if (visionMeta?.title) {
    title = visionMeta.title;
    if (visionMeta.author) author = visionMeta.author;
    if (visionMeta.durationSec) durationSec = visionMeta.durationSec;
  } else {
    // 2. Try Innertube
    try {
      const { Innertube, UniversalCache } = await import('youtubei.js');
      const yt = await Innertube.create({
        cache: new UniversalCache(false),
      });
      const info = await yt.getBasicInfo(videoId);
      if (info.basic_info.title) title = info.basic_info.title;
      if (info.basic_info.author) author = info.basic_info.author;
      if (info.basic_info.duration && typeof info.basic_info.duration === 'number') {
        durationSec = info.basic_info.duration;
      }
      const thumbs = info.basic_info.thumbnail;
      if (thumbs && thumbs.length > 0) {
        thumbnailUrl = thumbs[thumbs.length - 1].url;
      }
    } catch (innertubeErr: any) {
      console.warn(`[YouTube Ingestion] Innertube basic info failed for ${videoId}: ${innertubeErr.message}`);
      // 3. Fallback to oEmbed with browser User-Agent
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      try {
        const res = await fetch(oembedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json',
          },
          next: { revalidate: 3600 },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.title) title = data.title;
          if (data.author_name) author = data.author_name;
        }
      } catch (err: any) {
        console.warn(`[YouTube Ingestion] Failed to query oEmbed for ${videoId}: ${err.message}`);
      }
    }
  }

  const formattedDuration = formatDuration(durationSec);
  const isEligibleForFreeTier = IS_COMPLETELY_FREE
    ? durationSec <= MAX_PAID_VIDEO_DURATION_SEC
    : durationSec <= MAX_FREE_VIDEO_DURATION_SEC;

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    author,
    durationSec,
    formattedDuration,
    thumbnailUrl,
    isEligibleForFreeTier,
  };
}

/**
 * Direct VisionOS metadata resolver to bypass age-gates & login requirements
 */
async function fetchYouTubeSession(): Promise<{ cookieHeader: string; visitorData: string }> {
  const CONSENT_COOKIE = 'SOCS=CAESEwgDEgk2MTQ5MjcwODQaAmVuIAEaBgiA_LyaBg; PREF=tz=UTC&hl=en; VISITOR_PRIVACY_METADATA=CgJJThIEGgAgNA%3D%3D';

  // Strategy 1: YouTube's official visitor_id API endpoint (works 100% reliably from datacenter IPs)
  try {
    const vRes = await fetch('https://www.youtube.com/youtubei/v1/visitor_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cookie': CONSENT_COOKIE,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240401.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
      }),
    });

    if (vRes.ok) {
      const vData = await vRes.json();
      const visitorData = vData?.responseContext?.visitorData;
      let cookieHeader = CONSENT_COOKIE;
      try {
        if (typeof (vRes.headers as any).getSetCookie === 'function') {
          const raw = (vRes.headers as any).getSetCookie().map((c: string) => c.split(';')[0]).join('; ');
          if (raw) cookieHeader += '; ' + raw;
        }
      } catch (_) {}

      if (visitorData) {
        return { cookieHeader, visitorData };
      }
    }
  } catch (err: any) {
    console.warn(`[YouTube Ingestion] visitor_id API error: ${err.message}`);
  }

  // Strategy 2: Fallback to scraping youtube.com root HTML
  try {
    const pageRes = await fetch('https://www.youtube.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': CONSENT_COOKIE,
      },
    });
    const pageHtml = await pageRes.text();
    let cookieHeader = CONSENT_COOKIE;
    try {
      if (typeof (pageRes.headers as any).getSetCookie === 'function') {
        cookieHeader = (pageRes.headers as any).getSetCookie().map((c: string) => c.split(';')[0]).join('; ');
      } else {
        const raw = pageRes.headers.get('set-cookie');
        if (raw) cookieHeader = raw;
      }
    } catch (_) {}
    const visitorMatch = pageHtml.match(/"VISITOR_DATA":\s*"([^"]+)"/);
    const visitorData = visitorMatch ? visitorMatch[1] : '';
    return { cookieHeader, visitorData };
  } catch (_) {
    return { cookieHeader: CONSENT_COOKIE, visitorData: '' };
  }
}

async function getMetadataViaVisionOS(videoId: string): Promise<{ title?: string; author?: string; durationSec?: number } | null> {
  try {
    const { cookieHeader, visitorData } = await fetchYouTubeSession();

    const payload = {
      context: {
        client: {
          clientName: 'VISIONOS',
          clientVersion: '1.02',
          deviceMake: 'Apple',
          deviceModel: 'RealityDevice17,1',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
          osName: 'visionOS',
          osVersion: '26.5.23O471',
          hl: 'en',
          timeZone: 'UTC',
          utcOffsetMinutes: 0,
          visitorData: visitorData || undefined,
        },
      },
      videoId,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS',
          signatureTimestamp: 20711,
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    };

    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': '101',
        'X-Youtube-Client-Version': '1.02',
        'Origin': 'https://www.youtube.com',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.videoDetails?.title) {
        return {
          title: data.videoDetails.title,
          author: data.videoDetails.author,
          durationSec: Number(data.videoDetails.lengthSeconds) || undefined,
        };
      }
    }
  } catch (_) {}
  return null;
}

interface VisionOSResult {
  audioBuffer?: Buffer;
  filename?: string;
  metadata?: Partial<YouTubeVideoMetadata>;
  error?: string;
}

/**
 * Direct VisionOS Ingestion Strategy (Pure Node.js, 100% Vercel Serverless compatible)
 * Bypasses YouTube's "Video is login required" and age-gates without requiring a logged-in account,
 * and extracts direct un-ciphered audio streams directly in-memory.
 */
async function extractViaVisionOS(
  videoId: string,
  fallbackTitle: string
): Promise<VisionOSResult | null> {
  try {
    const { cookieHeader, visitorData } = await fetchYouTubeSession();

    const payload = {
      context: {
        client: {
          clientName: 'VISIONOS',
          clientVersion: '1.02',
          deviceMake: 'Apple',
          deviceModel: 'RealityDevice17,1',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
          osName: 'visionOS',
          osVersion: '26.5.23O471',
          hl: 'en',
          timeZone: 'UTC',
          utcOffsetMinutes: 0,
          visitorData: visitorData || undefined,
        },
      },
      videoId,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS',
          signatureTimestamp: 20711,
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    };

    const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': '101',
        'X-Youtube-Client-Version': '1.02',
        'Origin': 'https://www.youtube.com',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!playerRes.ok) return { error: `Player API returned HTTP ${playerRes.status}` };
    const data = await playerRes.json();
    if (data.playabilityStatus?.status !== 'OK') {
      const reason = data.playabilityStatus?.reason || data.playabilityStatus?.status || 'Restricted';
      console.warn(`[VisionOS Extraction] Playability status: ${data.playabilityStatus?.status} (${reason})`);
      return { error: `VisionOS: ${reason}` };
    }

    const adaptive = data.streamingData?.adaptiveFormats || [];
    const audioFormats = adaptive.filter((f: any) => f.mimeType?.includes('audio') && f.url);
    if (audioFormats.length === 0) return { error: 'VisionOS: No direct audio streams available' };

    // Pick a format under 15MB or lowest bitrate audio (itag 249 opus ~50k or itag 139 m4a ~50k or itag 250 opus ~70k)
    const selectedFormat = audioFormats.find((f: any) => f.itag === 249 || f.itag === 139 || f.itag === 250) || audioFormats[0];
    const isOpus = selectedFormat.mimeType?.includes('opus');
    const ext = isOpus ? '.webm' : '.m4a';

    // Cap audio at 18 MB (~25 minutes of speech) to ensure it stays well within Groq's 25MB limit
    const MAX_BYTES = 18 * 1024 * 1024;
    const audioRes = await fetch(selectedFormat.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
        'Range': `bytes=0-${MAX_BYTES}`,
      },
    });

    if (!audioRes.ok && audioRes.status !== 206) return { error: `Audio stream HTTP ${audioRes.status}` };

    const arrayBuf = await audioRes.arrayBuffer();
    if (arrayBuf.byteLength > 1024) {
      const audioBuffer = Buffer.from(arrayBuf);
      const extractedTitle = data.videoDetails?.title || fallbackTitle;
      console.log(`[YouTube Ingest] VisionOS direct stream extracted ${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB for "${extractedTitle}"`);

      return {
        audioBuffer,
        filename: `youtube_${videoId}${ext}`,
        metadata: {
          title: data.videoDetails?.title,
          author: data.videoDetails?.author,
          durationSec: Number(data.videoDetails?.lengthSeconds) || undefined,
        },
      };
    }
  } catch (err: any) {
    console.warn(`[YouTube Ingest] VisionOS direct stream error: ${err.message}`);
    return { error: `VisionOS error: ${err.message}` };
  }
  return null;
}

/**
 * Extracts the audio stream from a YouTube video URL.
 * Multi-tier extraction strategy:
 * 1. VisionOS Direct Stream (bypasses age-gates and login-requirements without bot detection)
 * 2. Pure Node.js in-memory stream via YouTube.js (InnerTube ANDROID client)
 * 3. Remote Video Worker (Railway / Render) if configured
 * 4. Local Python & yt-dlp via os.tmpdir() (safe for non-serverless dev hosts)
 */
export async function extractYouTubeAudioStream(
  url: string,
  userId: string = 'demo-user-1',
  checkEligibility: boolean = true
): Promise<{
  audioBuffer: Buffer;
  filename: string;
  metadata: YouTubeVideoMetadata;
}> {
  const metadata = await getYouTubeMetadata(url);

  // Validate free tier hard cap (<=60 min in beta) if requested
  if (checkEligibility) {
    const eligibility = await validateProcessingEligibility(userId, metadata.durationSec);
    if (!eligibility.allowed) {
      throw new Error(eligibility.reason || 'Video duration exceeds plan limits.');
    }
  }

  console.log(`[YouTube Ingest] Extracting audio for "${metadata.title}" (${metadata.videoId})...`);

  let lastErrorMsg = '';

  // --------------------------------------------------------------------------
  // STRATEGY 0: VisionOS Direct Stream (Bypasses login-gates, age-gates, and signature cipher)
  // 100% Serverless compatible on Vercel
  // --------------------------------------------------------------------------
  const visionResult = await extractViaVisionOS(metadata.videoId, metadata.title);
  if (visionResult?.audioBuffer && visionResult.audioBuffer.length > 1024) {
    return {
      audioBuffer: visionResult.audioBuffer,
      filename: visionResult.filename || `youtube_${metadata.videoId}.m4a`,
      metadata: {
        ...metadata,
        ...(visionResult.metadata || {}),
      },
    };
  }
  if (visionResult?.error) {
    lastErrorMsg = visionResult.error;
  }

  // --------------------------------------------------------------------------
  // STRATEGY 1: Pure JavaScript / TypeScript in-memory audio extraction (youtubei.js)
  // Zero Python, zero external binaries, 100% safe on Vercel Serverless / AWS Lambda.
  // --------------------------------------------------------------------------
  try {
    const { Innertube, UniversalCache } = await import('youtubei.js');
    const yt = await Innertube.create({
      cache: new UniversalCache(false),
    });

    // Android client delivers direct, un-ciphered audio streams
    let stream: any = null;
    try {
      stream = await yt.download(metadata.videoId, {
        type: 'audio',
        client: 'ANDROID',
      });
    } catch (androidErr: any) {
      console.warn(`[YouTube Ingest] ANDROID client download failed: ${androidErr.message}, trying default client...`);
      try {
        stream = await yt.download(metadata.videoId, {
          type: 'audio',
        });
      } catch (defaultErr: any) {
        console.warn(`[YouTube Ingest] Default client download failed: ${defaultErr.message}`);
        lastErrorMsg = androidErr.message || defaultErr.message;
      }
    }

    if (stream) {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      // 18 MB ceiling (~25 minutes of audio, comfortably under Groq Whisper 25 MB limit)
      const MAX_AUDIO_BYTES = 18 * 1024 * 1024;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.length;
        if (totalBytes >= MAX_AUDIO_BYTES) {
          try { await reader.cancel(); } catch (_) {}
          break;
        }
      }

      if (chunks.length > 0 && totalBytes > 1024) {
        const audioBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
        console.log(`[YouTube Ingest] Successfully extracted ${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB via YouTube.js for "${metadata.title}"`);
        return {
          audioBuffer,
          filename: `youtube_${metadata.videoId}.m4a`,
          metadata,
        };
      }
    }
  } catch (innertubeErr: any) {
    lastErrorMsg = innertubeErr.message;
    console.warn(`[YouTube Ingest] Pure-JS YouTube.js extraction failed: ${innertubeErr.message}. Attempting fallbacks...`);
  }

  // --------------------------------------------------------------------------
  // STRATEGY 2: Remote Railway / Render Worker if configured
  // --------------------------------------------------------------------------
  const workerUrl = process.env.RAILWAY_WORKER_URL || process.env.VIDEO_WORKER_URL;
  const workerToken = process.env.WORKER_SECRET_TOKEN;
  if (workerUrl) {
    try {
      console.log(`[YouTube Ingest] Attempting audio extraction via worker: ${workerUrl}...`);
      const workerRes = await fetch(`${workerUrl.replace(/\/$/, '')}/extract-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
        },
        body: JSON.stringify({
          url,
          videoId: metadata.videoId,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (workerRes.ok) {
        const arrayBuf = await workerRes.arrayBuffer();
        if (arrayBuf.byteLength > 1024) {
          const audioBuffer = Buffer.from(arrayBuf);
          console.log(`[YouTube Ingest] Successfully extracted audio via worker (${audioBuffer.length} bytes).`);
          return {
            audioBuffer,
            filename: `youtube_${metadata.videoId}.m4a`,
            metadata,
          };
        }
      }
    } catch (workerErr: any) {
      console.warn(`[YouTube Ingest] Worker audio extraction failed: ${workerErr.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // STRATEGY 3: Local Python & yt-dlp via os.tmpdir() (Development environment)
  // NEVER use process.cwd()/scratch because Vercel serverless filesystem is read-only.
  // --------------------------------------------------------------------------
  try {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const tempDir = path.join(os.tmpdir(), 'flowzora_yt');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const outPrefix = path.join(tempDir, `yt_${metadata.videoId}_${Date.now()}`);
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'extract-yt-audio.py');
    const metaPath = `${outPrefix}.meta.json`;

    if (fs.existsSync(scriptPath)) {
      await execFileAsync('python', [scriptPath, url, outPrefix], {
        timeout: 45000,
      });

      if (fs.existsSync(metaPath)) {
        const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        try { fs.unlinkSync(metaPath); } catch (_) {}

        if (parsed.success && parsed.filePath && fs.existsSync(parsed.filePath)) {
          const audioBuffer = fs.readFileSync(parsed.filePath);
          const ext = path.extname(parsed.filePath) || '.m4a';
          try { fs.unlinkSync(parsed.filePath); } catch (_) {}

          console.log(`[YouTube Ingest] Successfully extracted ${audioBuffer.length} bytes via yt-dlp for "${metadata.title}"`);
          return {
            audioBuffer,
            filename: `youtube_${metadata.videoId}${ext}`,
            metadata,
          };
        }
      }
    }
  } catch (localErr: any) {
    console.warn(`[YouTube Ingest] Local yt-dlp extraction failed: ${localErr.message}`);
  }

  // --------------------------------------------------------------------------
  // STRATEGY 4: Friendly, actionable error message if all strategies are exhausted
  // --------------------------------------------------------------------------
  const reasonSuffix = lastErrorMsg ? ` (${lastErrorMsg})` : '';
  throw new Error(
    `Unable to stream audio for YouTube video "${metadata.title}"${reasonSuffix}. ` +
    `YouTube's servers may be temporarily restricting automated playback for this video. ` +
    `Please download the audio or video file and upload it directly in the "Upload File" tab for instant clip generation.`
  );
}
