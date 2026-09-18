import { NextRequest, NextResponse } from 'next/server';
import { exportClipToMp4 } from '@/lib/pipeline/video-exporter';
import { inMemoryR2 } from '@/lib/storage/r2';
import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * GET: Streams the rendered MP4 file directly to the browser for instant file download.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clipId = searchParams.get('clipId') || 'clip-highlight';
    const format = (searchParams.get('format') || '9:16') as '9:16' | '1:1' | '16:9';
    const fitMode = (searchParams.get('fitMode') || 'fit') as 'fit' | 'crop';
    const isDownload = searchParams.get('download') === 'true';
    const startTime = Number(searchParams.get('startTime') || 0);
    const endTime = Number(searchParams.get('endTime') || 25);
    const sourceVideoUrl = searchParams.get('sourceVideoUrl') || '';

    // Include startTime and endTime so each clip and nudge variation has a unique filename and never serves stale clips
    const filename = `flowzora_${clipId}_${Math.round(startTime)}s-${Math.round(endTime)}s_${format.replace(':', 'x')}.mp4`;
    const localExportPath = path.resolve(process.cwd(), 'public/media/exports', filename);
    const tmpExportPath = path.join(os.tmpdir(), filename);

    let fileBuffer: Buffer | null = null;

    // 1. Check if a valid rendered file (> 50KB) exists on disk
    if (fs.existsSync(localExportPath)) {
      const sz = fs.statSync(localExportPath).size;
      if (sz > 50000) {
        fileBuffer = fs.readFileSync(localExportPath);
      }
    }
    if (!fileBuffer && fs.existsSync(tmpExportPath)) {
      const sz = fs.statSync(tmpExportPath).size;
      if (sz > 50000) {
        fileBuffer = fs.readFileSync(tmpExportPath);
      }
    }

    // 2. Check in-memory R2 cache for valid buffer (> 50KB)
    if (!fileBuffer) {
      for (const [key, item] of inMemoryR2.entries()) {
        if (
          (key === filename || (key.includes(clipId) && key.includes(format.replace(':', 'x')))) &&
          item.buffer &&
          item.buffer.length > 50000
        ) {
          fileBuffer = item.buffer;
          break;
        }
      }
    }

    // 3. If not rendered yet, render it on demand using the genuine source video
    if (!fileBuffer) {
      await exportClipToMp4({
        clipId,
        startTime,
        endTime,
        format,
        fitMode,
        sourceVideoUrl,
      });

      if (fs.existsSync(localExportPath)) {
        const sz = fs.statSync(localExportPath).size;
        if (sz > 50000) fileBuffer = fs.readFileSync(localExportPath);
      }
      if (!fileBuffer && fs.existsSync(tmpExportPath)) {
        const sz = fs.statSync(tmpExportPath).size;
        if (sz > 50000) fileBuffer = fs.readFileSync(tmpExportPath);
      }
      if (!fileBuffer) {
        for (const [key, item] of inMemoryR2.entries()) {
          if (
            (key === filename || (key.includes(clipId) && key.includes(format.replace(':', 'x')))) &&
            item.buffer &&
            item.buffer.length > 50000
          ) {
            fileBuffer = item.buffer;
            break;
          }
        }
      }
    }

    // 4. Source Video Fallback: Check cached uploaded source video (no sample video fallback)
    if (!fileBuffer || fileBuffer.length <= 50000) {
      const tmpSourcePath = path.join(os.tmpdir(), 'flowzora_latest_source.mp4');
      if (fs.existsSync(tmpSourcePath)) {
        fileBuffer = fs.readFileSync(tmpSourcePath);
      }
    }
    if (!fileBuffer || fileBuffer.length <= 50000) {
      const uploadsPath = path.resolve(process.cwd(), 'public/media/uploads/latest_source.mp4');
      if (fs.existsSync(uploadsPath)) {
        fileBuffer = fs.readFileSync(uploadsPath);
      }
    }

    if (!fileBuffer || fileBuffer.length <= 50000) {
      return NextResponse.json(
        { error: 'Clip export not found. Please upload a video file or generate clips first.' },
        { status: 404 }
      );
    }

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
      fitMode = 'fit',
      userId = 'demo-user-1',
      sourceVideoUrl = '',
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
      fitMode,
      userId,
      sourceVideoUrl,
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
