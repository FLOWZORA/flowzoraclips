import { NextRequest, NextResponse } from 'next/server';
import { normalizeYouTubeCookie, fetchYouTubeGuestSession } from '@/lib/pipeline/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Debug endpoint: tests YouTube cookie auth & high-speed audio streaming.
 * GET /api/debug/yt-test?v=VIDEO_ID
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('v') || 'QGLvwQX-Aos'; // default: Druski / Theo Von #489
  const detectedEnvKey =
    process.env.YOUTUBE_COOKIE ? 'YOUTUBE_COOKIE' :
    process.env.YOUTUBE_COOKIES ? 'YOUTUBE_COOKIES' :
    process.env.YT_COOKIE ? 'YT_COOKIE' :
    process.env.YT_COOKIES ? 'YT_COOKIES' : 'none';

  const rawCookie =
    process.env.YOUTUBE_COOKIE ||
    process.env.YOUTUBE_COOKIES ||
    process.env.YT_COOKIE ||
    process.env.YT_COOKIES ||
    '';
  const normalizedCookie = normalizeYouTubeCookie(rawCookie);

  const poToken = process.env.YOUTUBE_PO_TOKEN || process.env.YT_PO_TOKEN || undefined;

  let guestVisitorData: string | undefined = undefined;
  let guestCookieHeader: string | undefined = undefined;
  try {
    const guest = await fetchYouTubeGuestSession();
    guestVisitorData = guest.visitorData;
    guestCookieHeader = guest.cookieHeader;
  } catch (guestErr: any) {
    console.warn('[yt-test] fetchYouTubeGuestSession error:', guestErr.message);
  }

  const results: Record<string, any> = {
    videoId,
    timestamp: new Date().toISOString(),
    cookieDiagnostics: {
      detectedEnvKey,
      rawLength: rawCookie.length,
      normalizedLength: normalizedCookie.length,
      hasCookie: normalizedCookie.length > 0,
      hasSapisid: normalizedCookie.includes('SAPISID'),
      hasLoginInfo: normalizedCookie.includes('LOGIN_INFO'),
      hasSid: normalizedCookie.includes('SID'),
      isNetscapeFormat: rawCookie.includes('# Netscape') || rawCookie.includes('\t'),
      isJsonFormat: rawCookie.trim().startsWith('['),
      cookieSample: normalizedCookie ? normalizedCookie.slice(0, 40) + '...' : 'none',
    },
    guestSessionDiagnostics: {
      hasVisitorData: !!guestVisitorData,
      visitorDataLength: guestVisitorData?.length || 0,
      visitorDataSample: guestVisitorData ? guestVisitorData.slice(0, 30) + '...' : 'none',
      hasConsentCookie: !!guestCookieHeader,
      poTokenConfigured: !!poToken,
    },
    clientTests: {},
    overallSuccess: false,
  };

  try {
    const vm = await import('node:vm');
    const { Session, Innertube, ClientType, UniversalCache, Platform } = await import('youtubei.js');

    Platform.shim.eval = (data: any, env: any) => {
      const context = vm.createContext({ ...env });
      return vm.runInContext(`(function(){\n${data.output}\n})()`, context);
    };

    // Test Client 1: Mobile Web (MWEB)
    try {
      const t0 = Date.now();
      const mwebSession = await Session.create({
        client_type: ClientType.MWEB,
        cookie: normalizedCookie || undefined,
        visitor_data: guestVisitorData,
        po_token: poToken,
        cache: new UniversalCache(false),
      });
      const ytMweb = new Innertube(mwebSession);
      const streamMweb = await ytMweb.download(videoId, { type: 'audio' });

      if (streamMweb) {
        const reader = streamMweb.getReader();
        const { done, value } = await reader.read();
        try { await reader.cancel(); } catch (_) {}

        results.clientTests['MWEB'] = {
          success: !done && !!value && value.length > 0,
          chunkBytes: value?.length || 0,
          elapsedMs: Date.now() - t0,
        };
      } else {
        results.clientTests['MWEB'] = { success: false, error: 'Null stream returned' };
      }
    } catch (mwebErr: any) {
      results.clientTests['MWEB'] = { success: false, error: mwebErr.message };
    }

    // Test Client 2: Android Mobile (ANDROID)
    try {
      const t1 = Date.now();
      const androidSession = await Session.create({
        client_type: ClientType.ANDROID,
        device_category: 'mobile',
        cookie: normalizedCookie || undefined,
        visitor_data: guestVisitorData,
        po_token: poToken,
        cache: new UniversalCache(false),
      });
      const ytAndroid = new Innertube(androidSession);
      const streamAndroid = await ytAndroid.download(videoId, { type: 'audio' });

      if (streamAndroid) {
        const reader = streamAndroid.getReader();
        const { done, value } = await reader.read();
        try { await reader.cancel(); } catch (_) {}

        results.clientTests['ANDROID'] = {
          success: !done && !!value && value.length > 0,
          chunkBytes: value?.length || 0,
          elapsedMs: Date.now() - t1,
        };
      } else {
        results.clientTests['ANDROID'] = { success: false, error: 'Null stream returned' };
      }
    } catch (androidErr: any) {
      results.clientTests['ANDROID'] = { success: false, error: androidErr.message };
    }

    // Test Client 3: Web Desktop (WEB)
    try {
      const t2 = Date.now();
      const webSession = await Session.create({
        client_type: ClientType.WEB,
        cookie: normalizedCookie || undefined,
        visitor_data: guestVisitorData,
        po_token: poToken,
        cache: new UniversalCache(false),
      });
      const ytWeb = new Innertube(webSession);
      const streamWeb = await ytWeb.download(videoId, { type: 'audio' });

      if (streamWeb) {
        const reader = streamWeb.getReader();
        const { done, value } = await reader.read();
        try { await reader.cancel(); } catch (_) {}

        results.clientTests['WEB'] = {
          success: !done && !!value && value.length > 0,
          chunkBytes: value?.length || 0,
          elapsedMs: Date.now() - t2,
        };
      } else {
        results.clientTests['WEB'] = { success: false, error: 'Null stream returned' };
      }
    } catch (webErr: any) {
      results.clientTests['WEB'] = { success: false, error: webErr.message };
    }

    // Overall success if any client can download audio chunks
    results.overallSuccess = Object.values(results.clientTests).some((t: any) => t.success);
  } catch (err: any) {
    results.error = err.message;
    results.errorStack = err.stack?.split('\n').slice(0, 5).join('\n');
  }

  return NextResponse.json(results, { status: 200 });
}
