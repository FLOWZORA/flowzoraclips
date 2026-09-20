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

  const tiers: Array<'ANDROID' | 'MUSIC' | 'MWEB'> = ['ANDROID', 'MUSIC', 'MWEB'];

  for (const t of tiers) {
    try {
      const yt = await getInnertubeClient(t);
      const basic = await yt.getBasicInfo(videoId);
      results[`${t}_basicInfo`] = {
        success: true,
        title: basic?.basic_info?.title,
        duration: basic?.basic_info?.duration,
      };

      try {
        const stream = await yt.download(videoId, { type: 'audio' });
        const reader = stream.getReader();
        const { value } = await reader.read();
        await reader.cancel();
        results[`${t}_download`] = {
          success: true,
          chunkBytes: value ? value.length : 0,
        };
      } catch (dlErr: any) {
        results[`${t}_download`] = {
          success: false,
          error: dlErr.message,
          stack: dlErr.stack,
        };
      }
    } catch (err: any) {
      results[`${t}_basicInfo`] = {
        success: false,
        error: err.message,
        stack: err.stack,
      };
    }
  }

  return NextResponse.json(results);
}
