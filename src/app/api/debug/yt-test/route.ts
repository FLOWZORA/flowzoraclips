import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Debug endpoint: tests YouTube cookie auth + IOS client streaming data availability.
 * GET /api/debug/yt-test?v=VIDEO_ID
 * Remove this endpoint before going to production.
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('v') || 'dQw4w9WgXcQ'; // default: Rick Astley
  const results: Record<string, any> = {
    videoId,
    timestamp: new Date().toISOString(),
    env: {
      YOUTUBE_COOKIE_SET: !!process.env.YOUTUBE_COOKIE,
      YOUTUBE_COOKIE_LENGTH: process.env.YOUTUBE_COOKIE?.length || 0,
      YOUTUBE_COOKIE_PREVIEW: process.env.YOUTUBE_COOKIE?.slice(0, 80) + '...',
    },
  };

  try {
    // Step 1: Test Session.create with cookie
    const vm = await import('node:vm');
    const { Session, Innertube, ClientType, UniversalCache, Platform } = await import('youtubei.js');

    // Configure vm evaluator
    Platform.shim.eval = (data: any, env: any) => {
      const context = vm.createContext({ ...env });
      return vm.runInContext(`(function(){\n${data.output}\n})()`, context);
    };

    const cookie = process.env.YOUTUBE_COOKIE || undefined;

    const t0 = Date.now();
    const session = await Session.create({
      client_type: ClientType.IOS,
      device_category: 'mobile' as any,
      cookie,
      cache: new UniversalCache(false),
    });
    results.sessionCreated = true;
    results.sessionMs = Date.now() - t0;

    const yt = new Innertube(session);

    // Step 2: getBasicInfo
    const t1 = Date.now();
    const info = await yt.getBasicInfo(videoId);
    results.basicInfoMs = Date.now() - t1;
    results.title = info?.basic_info?.title;
    results.playabilityStatus = info?.playability_status?.status;
    results.playabilityReason = info?.playability_status?.reason;

    // Step 3: Check streaming_data
    const formats = info?.streaming_data?.adaptive_formats || info?.streaming_data?.formats || [];
    const audioFmt = formats.find((f: any) => f.has_audio && !f.has_video) || formats.find((f: any) => f.has_audio);
    results.adaptiveFormatsCount = info?.streaming_data?.adaptive_formats?.length || 0;
    results.audioFormatFound = !!audioFmt;
    results.audioMimeType = audioFmt?.mime_type;
    results.audioUrlPresent = !!audioFmt?.url;
    results.audioUrlPrefix = audioFmt?.url?.slice(0, 100);

    // Step 4: If URL present, try small CDN fetch
    if (audioFmt?.url) {
      const t2 = Date.now();
      const cdnResp = await fetch(audioFmt.url + '&range=0-4096', {
        headers: { 'User-Agent': 'com.google.ios.youtube/19.16.3 CFNetwork/1410.0.3 Darwin/22.6.0' },
        signal: AbortSignal.timeout(5000),
      });
      results.cdnFetchStatus = cdnResp.status;
      results.cdnFetchMs = Date.now() - t2;
      if (cdnResp.ok || cdnResp.status === 206) {
        const buf = await cdnResp.arrayBuffer();
        results.cdnFetchBytes = buf.byteLength;
        results.cdnFetchOk = true;
      } else {
        results.cdnFetchOk = false;
      }
    }

    results.overallOk = results.audioUrlPresent && results.cdnFetchOk;
  } catch (e: any) {
    results.error = e.message;
    results.errorStack = e.stack?.split('\n').slice(0, 5).join('\n');
  }

  return NextResponse.json(results, { status: 200 });
}
