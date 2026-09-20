import {
  validateProcessingEligibility,
  IS_COMPLETELY_FREE,
  MAX_PAID_VIDEO_DURATION_SEC,
  MAX_FREE_VIDEO_DURATION_SEC,
  MAX_SERVERLESS_DURATION_SEC,
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
 * Returns an undici ProxyAgent when YOUTUBE_PROXY_URL, HTTPS_PROXY, or HTTP_PROXY is defined.
 * Routes YouTube requests through a proxy to bypass cloud datacenter IP restrictions if needed.
 */
export async function getProxyAgent(): Promise<any> {
  const proxyUrl =
    process.env.YOUTUBE_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  if (!proxyUrl || !proxyUrl.trim()) return null;

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
 * Custom fetch wrapper that routes requests through ProxyAgent when configured.
 * Safely handles Request objects and falls back gracefully to standard fetch on error.
 */
export async function customYouTubeFetch(input: any, init?: any): Promise<Response> {
  const agent = await getProxyAgent();
  if (agent) {
    try {
      const { fetch: undiciFetch } = await import('undici');
      let urlString: string;
      let mergedInit: any = init || {};
      if (typeof input === 'string' || input instanceof URL) {
        urlString = typeof input === 'string' ? input : input.toString();
      } else if (input && typeof input === 'object' && 'url' in input) {
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
      return (await undiciFetch(urlString, {
        ...mergedInit,
        dispatcher: agent,
      })) as unknown as Response;
    } catch (proxyErr: any) {
      console.warn(`[YouTube Ingest] Proxy fetch error, falling back to direct fetch: ${proxyErr.message}`);
    }
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
  if (
    str.includes('\t') ||
    str.includes('# Netscape') ||
    str.includes('# HTTP Cookie File') ||
    str.includes('#HttpOnly_')
  ) {
    const lines = str.split(/\r?\n/);
    const cookieMap = new Map<string, string>();

    for (const line of lines) {
      let trimmed = line.trim();
      if (!trimmed) continue;

      // CRITICAL: Handle #HttpOnly_ prefix used by all browser cookie export tools.
      // Google authentication cookies (LOGIN_INFO, __Secure-1PSID, __Secure-3PSID, SID, HSID, SSID)
      // are all marked HttpOnly! Skipping lines with '#' dropped all auth cookies!
      if (trimmed.startsWith('#HttpOnly_')) {
        trimmed = trimmed.replace(/^#HttpOnly_/, '');
      } else if (trimmed.startsWith('#')) {
        // True comment header, skip
        continue;
      }

      // Check if line is a tab-separated or space-separated Netscape record
      let parts = trimmed.split('\t');
      if (parts.length < 7) {
        parts = trimmed.split(/\s{2,}/);
      }
      if (parts.length < 7) {
        const words = trimmed.split(/\s+/);
        if (words.length >= 7) {
          parts = [words[0], words[1], words[2], words[3], words[4], words[5], words.slice(6).join(' ')];
        }
      }

      if (parts.length >= 7) {
        const name = parts[5].trim();
        const val = parts[6].trim();
        if (name && val && !name.includes(' ')) {
          cookieMap.set(name, `${name}=${val}`);
          continue;
        }
      }

      // Fallback: check if line is key=value
      if (trimmed.includes('=')) {
        const eqIdx = trimmed.indexOf('=');
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).replace(/;$/, '').trim();
        if (k && !k.includes(' ') && !k.startsWith('#')) {
          cookieMap.set(k, `${k}=${v}`);
        }
      }
    }

    if (cookieMap.size > 0) {
      return Array.from(cookieMap.values()).join('; ');
    }
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

interface GuestSession {
  visitorData: string;
  cookieHeader: string;
  cachedAt: number;
}
let cachedGuestSession: GuestSession | null = null;
const GUEST_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12-hour session cache

/**
 * Generates an official YouTube guest session with a valid visitorData token and Google consent cookies (SOCS).
 * Replicates how modern video downloaders (Cobalt, yt-dlp) bypass datacenter IP restrictions
 * by presenting valid visitor tokens to YouTube's InnerTube API.
 */
export async function fetchYouTubeGuestSession(forceRefresh: boolean = false): Promise<{ cookieHeader: string; visitorData: string }> {
  if (!forceRefresh && cachedGuestSession && (Date.now() - cachedGuestSession.cachedAt < GUEST_SESSION_TTL_MS) && cachedGuestSession.visitorData) {
    return {
      cookieHeader: cachedGuestSession.cookieHeader,
      visitorData: cachedGuestSession.visitorData,
    };
  }

  const CONSENT_COOKIE = 'SOCS=CAESEwgDEgk2MTQ5MjcwODQaAmVuIAEaBgiA_LyaBg; PREF=tz=UTC&hl=en; VISITOR_PRIVACY_METADATA=CgJJThIEGgAgNA%3D%3D';

  // Strategy 1: YouTube official visitor_id API endpoint (works reliably across cloud IPs)
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
        cachedGuestSession = {
          visitorData,
          cookieHeader,
          cachedAt: Date.now(),
        };
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
    if (visitorData) {
      cachedGuestSession = {
        visitorData,
        cookieHeader,
        cachedAt: Date.now(),
      };
    }
    return { cookieHeader, visitorData };
  } catch (_) {
    return { cookieHeader: CONSENT_COOKIE, visitorData: '' };
  }
}

export const fetchYouTubeSession = fetchYouTubeGuestSession;

const innertubeClients: Record<string, Promise<any>> = {};

/**
 * Returns a cached Innertube instance configured with the specified client session.
 * Automatically injects normalized YouTube cookie authentication, guest visitorData,
 * optional po_token, and sets proper device headers.
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

      const rawCookie =
        process.env.YOUTUBE_COOKIE ||
        process.env.YOUTUBE_COOKIES ||
        process.env.YT_COOKIE ||
        process.env.YT_COOKIES ||
        undefined;
      const cookie = normalizeYouTubeCookie(rawCookie) || undefined;
      const poToken = process.env.YOUTUBE_PO_TOKEN || process.env.YT_PO_TOKEN || undefined;

      // When authenticated cookies are provided, preserve the user session.
      // When cookies are absent, inject guest visitor_data token so datacenter requests don't look like anonymous bots.
      let visitorData: string | undefined = undefined;
      if (!cookie) {
        try {
          const guest = await fetchYouTubeGuestSession();
          if (guest.visitorData) {
            visitorData = guest.visitorData;
          }
        } catch (guestErr: any) {
          console.warn('[YouTube Ingest] Could not obtain visitorData token:', guestErr?.message || guestErr);
        }
      }

      const session = await Session.create({
        device_category: deviceCategory,
        client_type: clientTypeVal,
        cookie,
        visitor_data: visitorData,
        po_token: poToken,
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

  let title = 'Creator Video';
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
  // Must mirror validateProcessingEligibility, or the preview says a video is
  // fine and the POST then rejects it.
  const isEligibleForFreeTier = IS_COMPLETELY_FREE
    ? durationSec <= MAX_SERVERLESS_DURATION_SEC
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
 * Identifies an audio container from its magic bytes.
 *
 * The worker asks yt-dlp for mp3, but yt-dlp cannot run its ffmpeg
 * post-processor when writing to stdout, so what actually comes back is the
 * raw bestaudio container -- usually Opus-in-WebM. Labelling those bytes
 * ".mp3" matters: Groq rejects uploads whose extension disagrees with the
 * content (see the extension handling in whisper.ts).
 */
function sniffAudioExtension(buf: Buffer): string {
  if (buf.length >= 4) {
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return '.webm'; // EBML
    const head4 = buf.toString('ascii', 0, 4);
    if (head4 === 'OggS') return '.ogg';
    if (head4 === 'fLaC') return '.flac';
    if (head4 === 'RIFF') return '.wav';
    if (buf.toString('ascii', 0, 3) === 'ID3') return '.mp3';
    if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return '.mp3'; // MPEG frame sync
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return '.m4a';
  console.warn('[YouTube Ingest] Could not identify audio container from magic bytes; defaulting to .mp3');
  return '.mp3';
}

/**
 * Extracts the audio stream from a YouTube video URL.
 * Multi-tier extraction strategy:
 * 1. Android Mobile Session (InnerTube pure-JS client, zero bot checks, zero login required)
 * 2. VisionOS Direct Stream (bypasses signature cipher)
 * 3. Remote Video Worker (Railway / Render) if configured
 * 4. Local Python & yt-dlp via os.tmpdir() (safe for non-serverless dev hosts)
 */
/** Increased to 50s to give Railway worker + InnerTube fallbacks sufficient time */
const EXTRACTION_GLOBAL_TIMEOUT_MS = 50_000;

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

  // --------------------------------------------------------------------------
  // FAST FAIL: serverless host with no extraction worker configured.
  //
  // Verified empirically against a deployed worker: YouTube answers requests
  // from cloud datacenter IPs with "Sign in to confirm you're not a bot", and
  // that demand is for AUTHENTICATION -- PO Tokens explicitly do not satisfy
  // it. Without account cookies, every server-side strategy below is going to
  // lose from Vercel, and grinding through all of them costs the user ~50s
  // before showing the same message they could have had instantly.
  //
  // Worse, when a tier does squeak through it hits the MAX_AUDIO_BYTES cap and
  // returns a truncated stream: a 23-minute video came back as 84 seconds of
  // audio and was reported as success. Failing cleanly beats that.
  //
  // Local dev has no VERCEL env var, so it still runs every strategy below --
  // including the local yt-dlp path, which works fine from a residential IP.
  // Setting YOUTUBE_WORKER_URL also re-enables the full chain.
  const workerConfigured = !!(process.env.YOUTUBE_WORKER_URL || process.env.YT_WORKER_URL);
  if (process.env.VERCEL && !workerConfigured) {
    console.log('[YouTube Ingest] No worker configured on serverless host — failing fast to the upload path.');
    throw new Error(
      `YouTube's bot-detection policies are restricting direct cloud server playback for "${metadata.title}". ` +
      `Please download the audio or video file and upload it directly in the "Upload File" tab for instant, unrestricted clip generation.`
    );
  }

  await ensurePlatformEvaluator();

  const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB ceiling (~10-14 min audio, downloads in ~1s)

  // --------------------------------------------------------------------------
  // STRATEGY 1: Railway/Render Worker (yt-dlp in Docker — most reliable)
  // This is the same stack Opus Clip / Klap use. Railway IPs are not on
  // YouTube's datacenter blocklist. yt-dlp handles all JS challenges.
  // Set YOUTUBE_WORKER_URL + WORKER_SECRET_TOKEN env vars to enable.
  //
  // NOTE: deliberately NOT RAILWAY_WORKER_URL. That variable already points at
  // the ffmpeg render worker (see video-exporter.ts), which has no
  // /extract-audio route — reusing it here just yields a 404 on every video.
  // The audio worker is a separate service and needs its own URL.
  // --------------------------------------------------------------------------
  const workerUrl = process.env.YOUTUBE_WORKER_URL || process.env.YT_WORKER_URL;
  // Prefer a token scoped to THIS worker. WORKER_SECRET_TOKEN is shared with
  // the ffmpeg render worker (video-exporter.ts), so rotating it would take
  // video export down too; a dedicated var lets this service hold a strong
  // secret independently. Falls back to the shared one when unset.
  const workerToken = (process.env.YOUTUBE_WORKER_TOKEN || process.env.WORKER_SECRET_TOKEN || '').trim();
  if (workerUrl) {
    try {
      console.log(`[YouTube Ingest] Attempting audio extraction via Railway worker: ${workerUrl}...`);
      // Deliberately do NOT forward a cookie. The worker owns its own
      // YOUTUBE_COOKIE and its request body takes precedence over that env var
      // (see writeCookieFile in railway-worker/server.js), so sending one here
      // OVERRIDES the worker's cookies with whatever this host happens to hold.
      //
      // That is a live failure, not a hypothetical: Vercel's YOUTUBE_COOKIE was
      // a stale export, and forwarding it made every production extraction fail
      // with "Sign in to confirm you're not a bot" while the very same request
      // succeeded when sent without a cookie. Verified by A/B against the
      // deployed worker.
      //
      // Keeping cookies solely on the worker also means the session never
      // crosses the network on each request, and there is one place to rotate.
      const workerRes = await fetch(`${workerUrl.replace(/\/$/, '')}/extract-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${metadata.videoId}`,
          videoId: metadata.videoId,
        }),
        signal: AbortSignal.timeout(45_000), // worker's own cap is EXTRACT_TIMEOUT_MS (40s)
      });

      if (workerRes.ok) {
        const arrayBuf = await workerRes.arrayBuffer();
        if (arrayBuf.byteLength > 1024) {
          const audioBuffer = Buffer.from(arrayBuf);
          const ext = sniffAudioExtension(audioBuffer);
          console.log(`[YouTube Ingest] ✓ Worker extracted ${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB audio (${ext}) for "${metadata.title}"`);
          return {
            audioBuffer,
            filename: `youtube_${metadata.videoId}${ext}`,
            metadata,
          };
        }
      } else {
        const errBody = await workerRes.text().catch(() => '');
        console.warn(`[YouTube Ingest] Railway worker returned HTTP ${workerRes.status}: ${errBody.slice(0, 200)}`);
        lastErrorMsg = `Worker HTTP ${workerRes.status}`;
      }
    } catch (workerErr: any) {
      console.warn(`[YouTube Ingest] Railway worker failed: ${workerErr.message}`);
      lastErrorMsg = workerErr.message;
    }
  }

  // --------------------------------------------------------------------------
  // STRATEGY 2: High-Speed Innertube Stream (MWEB, ANDROID, TV_EMBEDDED, WEB)
  // Fallback for when no Railway worker is configured (local dev) or worker fails.
  // Datacenter IP restrictions mean these often fail on Vercel production.
  // --------------------------------------------------------------------------
  const innertubeTiers: Array<{ name: string; type: 'WEB' | 'MWEB' | 'ANDROID' | 'TV' }> = [
    { name: 'TV Embedded (TV)', type: 'TV' },
    { name: 'Mobile Web (MWEB)', type: 'MWEB' },
    { name: 'Android Mobile (ANDROID)', type: 'ANDROID' },
    { name: 'Web Desktop (WEB)', type: 'WEB' },
  ];

  const TIER_TIMEOUT_MS = 4_000; // 4s per tier — tight to preserve budget for VisionOS fallback

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

  // (Railway worker is now Strategy 1 above — this block kept for legacy reference)
  // --------------------------------------------------------------------------

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
      try {
        await execFileAsync('python', [scriptPath, url, outPrefix], {
          timeout: 60000,
        });
      } catch (execErr: any) {
        console.warn(`[YouTube Ingest] Python execution warning: ${execErr.message}`);
      }

      if (fs.existsSync(metaPath)) {
        let parsed: any = null;
        try {
          parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          fs.unlinkSync(metaPath);
        } catch (_) {}

        if (parsed?.success && parsed.filePath && fs.existsSync(parsed.filePath)) {
          let audioBuffer: Buffer = fs.readFileSync(parsed.filePath);
          let ext = path.extname(parsed.filePath) || '.m4a';
          try { fs.unlinkSync(parsed.filePath); } catch (_) {}

          // If extracted audio is large (>22MB), transcode down to 64k MP3 to guarantee it fits under Groq's 25MB limit
          if (audioBuffer.length > 22 * 1024 * 1024) {
            console.log(`[YouTube Ingest] yt-dlp extracted ${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB. Transcoding to lightweight MP3...`);
            const transcoded = await transcodeToMp3IfPossible(audioBuffer, metadata.videoId);
            audioBuffer = Buffer.from(transcoded.buffer);
            ext = '.mp3';
          }

          console.log(`[YouTube Ingest] Successfully extracted ${audioBuffer.length} bytes via yt-dlp for "${metadata.title}"`);
          return {
            audioBuffer,
            filename: `youtube_${metadata.videoId}${ext}`,
            metadata,
          };
        } else if (parsed?.error) {
          console.warn(`[YouTube Ingest] Local yt-dlp reported error: ${parsed.error}`);
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
