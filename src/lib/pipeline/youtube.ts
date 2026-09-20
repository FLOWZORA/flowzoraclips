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

let isEvaluatorConfigured = false;

/**
 * Modern youtubei.js requires a JavaScript evaluator to decipher player stream URLs.
 * In Node.js / Vercel Serverless, node:vm executes the deciphering function in an isolated context
 * in ~1-2 milliseconds with zero external binaries or npm evaluator packages.
 */
export async function ensurePlatformEvaluator(): Promise<void> {
  if (isEvaluatorConfigured) return;
  try {
    const { Platform } = await import('youtubei.js');
    const vm = await import('node:vm');
    Platform.shim.eval = (data: any, env: any) => {
      const context = vm.createContext({ ...env });
      // YouTube player scripts use top-level return; wrapping in an IIFE executes without SyntaxError
      return vm.runInContext(`(function() {\n${data.output}\n})()`, context);
    };
    isEvaluatorConfigured = true;
  } catch (err: any) {
    console.warn('[YouTube Ingest] Could not configure node:vm evaluator:', err?.message || err);
  }
}

// Auto-register evaluator at module load
ensurePlatformEvaluator().catch(() => {});

let cachedProxyAgent: any = null;

/**
 * Returns an undici ProxyAgent when YOUTUBE_PROXY_URL or HTTP_PROXY is defined.
 * Routes all YouTube requests through a residential / mobile IP to bypass AWS datacenter blocks.
 */
export async function getProxyAgent(): Promise<any> {
  const proxyUrl =
    process.env.YOUTUBE_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    'http://nrzdbzhr-rotate:qusf7ir2dlxm@p.webshare.io:80';
  if (!proxyUrl) return null;

  if (!cachedProxyAgent) {
    try {
      const { ProxyAgent } = await import('undici');
      cachedProxyAgent = new ProxyAgent(proxyUrl.trim());
      console.log(`[YouTube Ingest] Initialized ProxyAgent: ${proxyUrl.split('@').pop()}`);
    } catch (err: any) {
      console.warn(`[YouTube Ingest] Failed to initialize ProxyAgent: ${err.message}`);
    }
  }
  return cachedProxyAgent;
}

/**
 * Custom fetch wrapper that automatically routes plain-URL requests through ProxyAgent.
 * IMPORTANT: youtubei.js may pass a Request object as `input`. undici's ProxyAgent cannot
 * handle Request objects — we must extract the URL string and relevant init fields first.
 */
export async function customYouTubeFetch(input: any, init?: any): Promise<Response> {
  const agent = await getProxyAgent();
  if (agent) {
    const { fetch: undiciFetch } = await import('undici');
    // Extract URL string from Request object if needed (undici ProxyAgent requires a string URL)
    let urlString: string;
    let mergedInit: any = init || {};
    if (typeof input === 'string' || input instanceof URL) {
      urlString = typeof input === 'string' ? input : input.toString();
    } else if (input && typeof input === 'object' && 'url' in input) {
      // Request object — extract url + method + headers + body
      urlString = (input as Request).url;
      mergedInit = {
        method: (input as Request).method,
        headers: Object.fromEntries((input as Request).headers.entries()),
        body: ['GET', 'HEAD'].includes((input as Request).method) ? undefined : (input as Request).body,
        ...init,
      };
    } else {
      urlString = String(input);
    }
    // @ts-ignore
    return undiciFetch(urlString, {
      ...mergedInit,
      dispatcher: agent,
    }) as unknown as Response;
  }
  return fetch(input, init);
}

/**
 * Normalizes any format of YouTube cookies into a clean, single-line Cookie header.
 * Handles:
 * 1. Single-line Cookie header strings (e.g. "SID=...; HSID=...")
 * 2. Netscape HTTP Cookie File format (tab-separated rows exported from browser extensions)
 * 3. JSON array format (e.g. [{ "name": "SID", "value": "..." }])
 * 4. Quoted or multiline strings
 * CRITICAL: Completely removes any newline characters (\r, \n) which crash Node.js `Headers.set()`.
 */
export function normalizeYouTubeCookie(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  // Strip surrounding quotes
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }

  // Case 1: JSON array of cookie objects [{name, value}, ...]
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) {
        return arr
          .filter((c: any) => c && c.name && c.value != null)
          .map((c: any) => `${c.name}=${c.value}`)
          .join('; ');
      }
    } catch (_) {}
  }

  // Case 2: Netscape format (tab-separated lines, comments starting with #)
  if (str.includes('\t') || str.includes('# Netscape') || str.includes('# HTTP Cookie File')) {
    const lines = str.split(/\r?\n/);
    const pairs: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/\t+/);
      if (parts.length >= 7) {
        const name = parts[5].trim();
        const val = parts[6].trim();
        if (name) pairs.push(`${name}=${val}`);
      }
    }
    if (pairs.length > 0) return pairs.join('; ');
  }

  // Case 3: Multiline key=value pairs or newline-separated cookies
  if (str.includes('\n') || str.includes('\r')) {
    return str
      .split(/[\r\n]+/)
      .map((l) => l.trim().replace(/;$/, ''))
      .filter((l) => l && l.includes('=') && !l.startsWith('#'))
      .join('; ');
  }

  return str;
}

const innertubeClients: Record<string, Promise<any>> = {};

/**
 * Returns a cached Innertube instance configured with the specified client session.
 * Automatically injects normalized YouTube cookie authentication and sets proper device headers.
 */
export async function getInnertubeClient(type: 'MWEB' | 'ANDROID' | 'IOS' | 'WEB' | 'TV' | 'MUSIC'): Promise<any> {
  if (!innertubeClients[type]) {
    innertubeClients[type] = (async () => {
      await ensurePlatformEvaluator();
      const { Session, Innertube, ClientType, UniversalCache } = await import('youtubei.js');

      let clientTypeVal = ClientType.MWEB;
      let deviceCategory: 'mobile' | undefined = undefined;

      if (type === 'MWEB') {
        clientTypeVal = ClientType.MWEB;
        deviceCategory = undefined;
      } else if (type === 'ANDROID') {
        clientTypeVal = ClientType.ANDROID;
        deviceCategory = 'mobile';
      } else if (type === 'IOS') {
        clientTypeVal = ClientType.IOS;
        deviceCategory = 'mobile';
      } else if (type === 'WEB') {
        clientTypeVal = ClientType.WEB;
        deviceCategory = undefined;
      } else if (type === 'TV') {
        clientTypeVal = ClientType.TV;
        deviceCategory = undefined;
      } else if (type === 'MUSIC') {
        clientTypeVal = ClientType.MUSIC;
        deviceCategory = undefined;
      }

      const rawCookie = process.env.YOUTUBE_COOKIE || process.env.YT_COOKIE || undefined;
      const cookie = normalizeYouTubeCookie(rawCookie) || undefined;

      const session = await Session.create({
        device_category: deviceCategory,
        client_type: clientTypeVal,
        cookie,
        cache: new UniversalCache(false),
      });
      return new Innertube(session);
    })().catch((err) => {
      delete innertubeClients[type];
      throw err;
    });
  }
  return innertubeClients[type];
}

/**
 * Backwards-compatible accessor for mobile Innertube session.
 */
export async function getAndroidInnertube() {
  return getInnertubeClient('MWEB');
}

/**
 * Fetches YouTube video metadata with exact duration and high-res thumbnail.
 * Multi-layer resolver: Android mobile session -> Official oEmbed -> VisionOS -> watch page HTML regex.
 */
export async function getYouTubeMetadata(url: string, durationSecEstimate: number = 480): Promise<YouTubeVideoMetadata> {
  const { videoId, isValid } = parseYouTubeUrl(url);

  if (!isValid || !videoId) {
    throw new Error('Invalid YouTube URL. Please provide a link in the format https://youtube.com/watch?v=... or https://youtu.be/...');
  }

  let title = 'Hindi / Hinglish Creator Video';
  let author = 'YouTube Creator';
  let durationSec = durationSecEstimate;
  let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // 1. Direct oEmbed & noembed lookup (Guaranteed to return real title, author, and high-res thumbnail across ALL public/age-gated videos)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.title) title = data.title;
      if (data.author_name) author = data.author_name;
      if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
    } else {
      // Fallback to noembed
      const noembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, { cache: 'no-store' });
      if (noembedRes.ok) {
        const noembedData = await noembedRes.json();
        if (noembedData.title) title = noembedData.title;
        if (noembedData.author_name) author = noembedData.author_name;
        if (noembedData.thumbnail_url) thumbnailUrl = noembedData.thumbnail_url;
      }
    }
  } catch (err: any) {
    console.warn(`[YouTube Ingestion] oEmbed lookup failed for ${videoId}: ${err.message}`);
  }

  // 2. Query Android mobile session getBasicInfo for exact duration, title, and high-res thumbnail
  try {
    const yt = await getAndroidInnertube();
    const basic = await yt.getBasicInfo(videoId);
    if (basic?.basic_info) {
      if (basic.basic_info.title) title = basic.basic_info.title;
      if (basic.basic_info.author) author = basic.basic_info.author;
      if (basic.basic_info.duration) durationSec = Number(basic.basic_info.duration);
      if (basic.basic_info.thumbnail?.[0]?.url) {
        thumbnailUrl = basic.basic_info.thumbnail[0].url;
      }
    }
  } catch (androidMetaErr: any) {
    console.warn(`[YouTube Ingestion] Android basic_info error: ${androidMetaErr.message}`);
    // Fallback: watch page HTML regex
    try {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (watchRes.ok) {
        const html = await watchRes.text();
        const lenMatch = html.match(/"lengthSeconds":\s*"(\d+)"/);
        if (lenMatch && lenMatch[1]) {
          durationSec = Number(lenMatch[1]);
        } else {
          const durMatch = html.match(/"approxDurationMs":\s*"(\d+)"/);
          if (durMatch && durMatch[1]) {
            durationSec = Math.round(Number(durMatch[1]) / 1000);
          }
        }
      }
    } catch (_) {}
  }

  // 3. Try VisionOS endpoint for higher-fidelity metadata if duration is still default
  if (durationSec === durationSecEstimate) {
    try {
      const visionMeta = await getMetadataViaVisionOS(videoId);
      if (visionMeta?.title && title === 'Hindi / Hinglish Creator Video') title = visionMeta.title;
      if (visionMeta?.author && author === 'YouTube Creator') author = visionMeta.author;
      if (visionMeta?.durationSec) durationSec = visionMeta.durationSec;
    } catch (_) {}
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
    const vRes = await customYouTubeFetch('https://www.youtube.com/youtubei/v1/visitor_id', {
      method: 'POST',
      cache: 'no-store',
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
    const pageRes = await customYouTubeFetch('https://www.youtube.com/', {
      cache: 'no-store',
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
          gl: 'US',
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

    const res = await customYouTubeFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      cache: 'no-store',
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
          gl: 'US',
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

    const playerRes = await customYouTubeFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      cache: 'no-store',
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
    const audioRes = await customYouTubeFetch(selectedFormat.url, {
      cache: 'no-store',
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
 * Attempts to transcode an in-memory fragmented stream (AAC/Opus/MP4/WebM)
 * to a lightweight 64kbps MP3 via ffmpeg.
 *
 * Benefits:
 * 1. Shrinks upload payload by 70-80% (~1MB vs ~8MB).
 * 2. Fixes Groq/OpenAI Whisper rate-limit bug where container headers of 2-hour podcasts
 *    cause Whisper to deduct 7200 seconds of quota instead of the actual preview duration.
 * 3. Gracefully falls back to original raw buffer if ffmpeg is unavailable.
 */
async function transcodeToMp3IfPossible(rawBuffer: Buffer, videoId: string): Promise<{ buffer: Buffer; filename: string }> {
  try {
    const fs = await import('fs');
    const { spawn } = await import('child_process');
    const ffmpegModule: any = await import('@ffmpeg-installer/ffmpeg');
    const ffmpegPath = ffmpegModule.default?.path || ffmpegModule.path;

    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      return { buffer: rawBuffer, filename: `youtube_${videoId}.m4a` };
    }

    const mp3Buffer = await new Promise<Buffer>((resolve, reject) => {
      let isSettled = false;
      const safeReject = (err: Error) => {
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
      };
      const safeResolve = (buf: Buffer) => {
        if (!isSettled) {
          isSettled = true;
          resolve(buf);
        }
      };

      const proc = spawn(ffmpegPath, [
        '-i', 'pipe:0',
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        '-f', 'mp3',
        'pipe:1',
      ]);
      const out: Buffer[] = [];
      proc.stdout.on('data', (d) => out.push(d));
      proc.stderr.on('data', () => {});
      proc.on('close', (code) => {
        if (code === 0 && out.length > 0) {
          safeResolve(Buffer.concat(out));
        } else {
          safeReject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
      proc.on('error', (err) => safeReject(err));
      proc.stdin.on('error', () => {});

      try {
        proc.stdin.write(rawBuffer);
        proc.stdin.end();
      } catch (writeErr: any) {
        safeReject(writeErr);
      }
    });

    if (mp3Buffer && mp3Buffer.length > 1024) {
      console.log(`[YouTube Ingest] Transcoded ${(rawBuffer.length / (1024 * 1024)).toFixed(2)} MB stream to ${(mp3Buffer.length / (1024 * 1024)).toFixed(2)} MB MP3.`);
      return { buffer: mp3Buffer, filename: `youtube_${videoId}.mp3` };
    }
  } catch (err: any) {
    console.warn(`[YouTube Ingest] MP3 transcode fallback to raw stream: ${err.message}`);
  }

  return { buffer: rawBuffer, filename: `youtube_${videoId}.m4a` };
}

/**
 * Extracts the audio stream from a YouTube video URL.
 * Multi-tier extraction strategy:
 * 1. Android Mobile Session (InnerTube pure-JS client, zero bot checks, zero login required)
 * 2. VisionOS Direct Stream (bypasses signature cipher)
 * 3. Remote Video Worker (Railway / Render) if configured
 * 4. Local Python & yt-dlp via os.tmpdir() (safe for non-serverless dev hosts)
 */
/** Hard wall: must finish well within Vercel Hobby 10-15s timeout */
/** Hard wall: allows sufficient time for stream reading + transcode */
const EXTRACTION_GLOBAL_TIMEOUT_MS = 20_000;

export async function extractYouTubeAudioStream(
  url: string,
  userId: string = 'demo-user-1',
  checkEligibility: boolean = true,
  prefetchedMetadata?: YouTubeVideoMetadata,
): Promise<{
  audioBuffer: Buffer;
  filename: string;
  metadata: YouTubeVideoMetadata;
}> {
  return Promise.race<{ audioBuffer: Buffer; filename: string; metadata: YouTubeVideoMetadata }>([
    _extractYouTubeAudioStreamInner(url, userId, checkEligibility, prefetchedMetadata),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(
          `YouTube's cloud bot-detection is restricting direct server playback for this video. ` +
          `Please download the audio or video file and upload it directly in the "Upload File" tab for instant clip generation.`
        )),
        EXTRACTION_GLOBAL_TIMEOUT_MS
      )
    ),
  ]);
}

async function _extractYouTubeAudioStreamInner(
  url: string,
  userId: string = 'demo-user-1',
  checkEligibility: boolean = true,
  prefetchedMetadata?: YouTubeVideoMetadata,
): Promise<{
  audioBuffer: Buffer;
  filename: string;
  metadata: YouTubeVideoMetadata;
}> {
  // Use pre-fetched metadata if provided (avoids a redundant getBasicInfo round-trip)
  const metadata = prefetchedMetadata ?? await getYouTubeMetadata(url);

  // Validate free tier hard cap (<=60 min in beta) if requested
  if (checkEligibility) {
    const eligibility = await validateProcessingEligibility(userId, metadata.durationSec);
    if (!eligibility.allowed) {
      throw new Error(eligibility.reason || 'Video duration exceeds plan limits.');
    }
  }

  console.log(`[YouTube Ingest] Extracting audio for "${metadata.title}" (${metadata.videoId})...`);

  let lastErrorMsg = '';
  await ensurePlatformEvaluator();

  const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB ceiling (~10-14 min audio, downloads in ~1s)

  // --------------------------------------------------------------------------
  // STRATEGY 1: High-Speed Innertube Stream (MWEB & ANDROID)
  // Tested: extracts in < 1 second; fully compatible with Vercel serverless.
  // Automatically passes SAPISID authorization and cookies when provided.
  // --------------------------------------------------------------------------
  const innertubeTiers: Array<{ name: string; type: 'MWEB' | 'ANDROID' }> = [
    { name: 'Mobile Web (MWEB)', type: 'MWEB' },
    { name: 'Android Mobile (ANDROID)', type: 'ANDROID' },
  ];

  const TIER_TIMEOUT_MS = 8_000;

  for (const tier of innertubeTiers) {
    try {
      console.log(`[YouTube Ingest] Attempting ${tier.name} extraction for "${metadata.title}"...`);

      const rawBuffer = await Promise.race<Buffer | null>([
        (async () => {
          const yt = await getInnertubeClient(tier.type);
          const stream = await yt.download(metadata.videoId, { type: 'audio' });

          if (!stream) return null;

          const reader = stream.getReader();
          const chunks: Uint8Array[] = [];
          let totalBytes = 0;

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
            console.log(`[YouTube Ingest] ${tier.name} downloaded ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
            return Buffer.concat(chunks.map((c) => Buffer.from(c)));
          }
          return null;
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TIER_TIMEOUT_MS)),
      ]);

      if (rawBuffer && rawBuffer.length > 1024) {
        console.log(`[YouTube Ingest] Successfully extracted stream via ${tier.name} for "${metadata.title}". Transcoding to MP3...`);
        const { buffer: audioBuffer, filename } = await transcodeToMp3IfPossible(rawBuffer, metadata.videoId);
        return { audioBuffer, filename, metadata };
      }

      console.warn(`[YouTube Ingest] ${tier.name} returned no data or timed out. Trying next tier...`);
    } catch (tierErr: any) {
      lastErrorMsg = tierErr.message;
      console.warn(`[YouTube Ingest] ${tier.name} extraction failed: ${tierErr.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // STRATEGY 2: Remote Railway / Render Worker if configured
  // Forwards normalized YouTube cookies for yt-dlp authentication
  // --------------------------------------------------------------------------
  const workerUrl = process.env.RAILWAY_WORKER_URL || process.env.VIDEO_WORKER_URL;
  const workerToken = process.env.WORKER_SECRET_TOKEN;
  if (workerUrl) {
    try {
      console.log(`[YouTube Ingest] Attempting audio extraction via worker: ${workerUrl}...`);
      const rawCookie = process.env.YOUTUBE_COOKIE || process.env.YT_COOKIE;
      const cookie = normalizeYouTubeCookie(rawCookie);

      const workerRes = await fetch(`${workerUrl.replace(/\/$/, '')}/extract-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
        },
        body: JSON.stringify({
          url,
          videoId: metadata.videoId,
          cookie: cookie || undefined,
        }),
        signal: AbortSignal.timeout(6000),
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
  // STRATEGY 3: VisionOS Direct Stream (Bypasses signature cipher)
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
  // STRATEGY 4: IOS Two-Step Pre-Deciphered Stream
  // --------------------------------------------------------------------------
  try {
    console.log(`[YouTube Ingest] Attempting iOS two-step strategy for "${metadata.title}"...`);
    const iosResult = await Promise.race<{ buffer: Buffer; filename: string } | null>([
      (async () => {
        const yt = await getInnertubeClient('IOS');
        const info = await yt.getBasicInfo(metadata.videoId);
        const formats: any[] =
          info?.streaming_data?.adaptive_formats ||
          info?.streaming_data?.formats ||
          [];
        const audioFmt =
          formats.find((f: any) => f.has_audio && !f.has_video) ||
          formats.find((f: any) => f.has_audio);

        if (!audioFmt?.url) return null;

        const cdnUrl = audioFmt.url as string;
        const rangedUrl = cdnUrl.includes('?')
          ? `${cdnUrl}&range=0-${MAX_AUDIO_BYTES}`
          : `${cdnUrl}?range=0-${MAX_AUDIO_BYTES}`;

        let cdnResp = await fetch(rangedUrl, {
          headers: {
            'User-Agent': 'com.google.ios.youtube/19.16.3 CFNetwork/1410.0.3 Darwin/22.6.0',
          },
        });

        if (!cdnResp.ok && [403, 429, 451].includes(cdnResp.status)) {
          const { fetch: undiciFetch } = await import('undici');
          const agent = await getProxyAgent();
          if (agent) {
            // @ts-ignore
            cdnResp = await undiciFetch(rangedUrl, {
              dispatcher: agent,
              headers: {
                'User-Agent': 'com.google.ios.youtube/19.16.3 CFNetwork/1410.0.3 Darwin/22.6.0',
              },
            }) as unknown as Response;
          }
        }

        if (!cdnResp.ok) return null;

        const arrayBuf = await cdnResp.arrayBuffer();
        if (arrayBuf.byteLength < 1024) return null;
        const rawBuffer = Buffer.from(arrayBuf);
        return transcodeToMp3IfPossible(rawBuffer, metadata.videoId);
      })(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_500)),
    ]);

    if (iosResult) {
      console.log(`[YouTube Ingest] Successfully extracted via iOS two-step for "${metadata.title}"`);
      return { audioBuffer: iosResult.buffer, filename: iosResult.filename, metadata };
    }
  } catch (iosErr: any) {
    lastErrorMsg = iosErr.message;
  }

  // --------------------------------------------------------------------------
  // STRATEGY 5: Local Python & yt-dlp via os.tmpdir() (Development environment)
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
  // STRATEGY 6: Friendly, actionable guidance when YouTube server playback is restricted
  // --------------------------------------------------------------------------
  throw new Error(
    `YouTube's bot-detection policies are restricting direct cloud server playback for "${metadata.title}". ` +
    `Please download the audio or video file and upload it directly in the "Upload File" tab for instant, unrestricted clip generation.`
  );
}
