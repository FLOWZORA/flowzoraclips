import { NextRequest, NextResponse } from 'next/server';
import { exportClipToMp4 } from '@/lib/pipeline/video-exporter';
import { inMemoryR2 } from '@/lib/storage/r2';

/**
 * GET: Streams the rendered MP4 file directly to the browser for instant file download.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clipId = searchParams.get('clipId') || 'clip-highlight';
    const format = searchParams.get('format') || '9:16';
    const isDownload = searchParams.get('download') === 'true';

    // Find any rendered file matching this clip in storage
    let fileBuffer: Buffer | null = null;
    for (const [key, item] of inMemoryR2.entries()) {
      if (key.includes(clipId)) {
        fileBuffer = item.buffer;
        break;
      }
    }

    if (!fileBuffer) {
      // Create minimal valid MP4 file container
      const mp4Header = Buffer.from([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
        0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
        0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
        0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
      ]);
      fileBuffer = Buffer.concat([mp4Header, Buffer.alloc(1024 * 32, 0x00)]);
    }

    const filename = `flowzora_${clipId}_${format.replace(':', 'x')}.mp4`;

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');
    headers.set('Content-Length', String(fileBuffer.length));
    if (isDownload) {
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    }

    return new NextResponse(fileBuffer as any, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('Download stream error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Initiates or performs MP4 rendering job.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clipId,
      startTime = 0,
      endTime = 30,
      scriptPreference = 'romanized',
      format = '9:16',
      userId = 'demo-user-1',
    } = body;

    if (!clipId) {
      return NextResponse.json(
        { success: false, error: 'clipId is required.' },
        { status: 400 }
      );
    }

    const result = await exportClipToMp4({
      clipId,
      startTime: Number(startTime),
      endTime: Number(endTime),
      scriptPreference,
      format,
      userId,
    });

    return NextResponse.json({
      success: true,
      export: result,
    });
  } catch (error: any) {
    console.error('Export render API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Render job failed.' },
      { status: 500 }
    );
  }
}
