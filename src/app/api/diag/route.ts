import { NextRequest, NextResponse } from 'next/server';
import { getInnertubeClient, ensurePlatformEvaluator } from '@/lib/pipeline/youtube';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('v') || 'QGLvwQX-Aos';

  await ensurePlatformEvaluator();

  const results: Record<string, any> = {
    commit: '886724e',
    nodeVersion: process.version,
    env: process.env.NODE_ENV,
  };

  const { ClientType, Session, Innertube, UniversalCache } = await import('youtubei.js');

  // Fetch real visitorData from YouTube official endpoint
  let visitorData: string | undefined;
  try {
    const vRes = await fetch('https://www.youtube.com/youtubei/v1/visitor_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20240401.01.00' } } })
    });
    const vData = await vRes.json();
    visitorData = vData?.responseContext?.visitorData;
    results.visitorDataObtained = !!visitorData;
  } catch (vErr: any) {
    results.visitorDataError = vErr.message;
  }

  const candidateClients: Array<{ name: string; clientType: any; deviceCategory?: any }> = [
    { name: 'ANDROID_with_visitor', clientType: ClientType.ANDROID, deviceCategory: 'mobile' },
    { name: 'MUSIC_with_visitor', clientType: ClientType.MUSIC, deviceCategory: undefined },
    { name: 'MWEB_with_visitor', clientType: ClientType.MWEB, deviceCategory: undefined },
    { name: 'ANDROID_VR', clientType: ClientType.ANDROID_VR, deviceCategory: undefined },
    { name: 'IOS', clientType: ClientType.IOS, deviceCategory: 'mobile' },
  ];

  for (const c of candidateClients) {
    try {
      const session = await Session.create({
        device_category: c.deviceCategory,
        client_type: c.clientType,
        visitor_data: visitorData,
        cookie: 'PREF=tz=UTC&hl=en;',
        cache: new UniversalCache(false),
      });
      const yt = new Innertube(session);
      const basic = await yt.getBasicInfo(videoId);
      const stream = await yt.download(videoId, { type: 'audio' });
      const reader = stream.getReader();
      const { value } = await reader.read();
      await reader.cancel();
      results[c.name] = {
        success: true,
        chunkBytes: value ? value.length : 0,
        title: basic?.basic_info?.title,
      };
    } catch (err: any) {
      results[c.name] = {
        success: false,
        error: err.message,
      };
    }
  }

  return NextResponse.json(results);
}
