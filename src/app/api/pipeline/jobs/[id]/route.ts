import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs/store';
import { getBufferFromR2 } from '@/lib/storage/r2';
import { inMemoryClips } from '@/lib/pipeline/video-exporter';

/**
 * Poll a background job. Response:
 * - running: { success: true, job: { id, status, progress, stageDetail } }
 * - completed: + { data, scoring, sourceVideoKey } (same shape as analyze)
 * - failed: { success: false, job: {...}, error }
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ success: false, error: 'Job not found.' }, { status: 404 });
  }

  const jobView = {
    id: job.id,
    status: job.status,
    progress: job.progress,
    stageDetail: job.stageDetail,
    error: job.error,
  };

  if (job.status === 'failed') {
    return NextResponse.json({ success: false, job: jobView, error: job.error || 'Processing failed.' });
  }

  if (job.status !== 'completed') {
    return NextResponse.json({ success: true, job: jobView, queued: true });
  }

  if (!job.resultKey) {
    return NextResponse.json(
      { success: false, job: jobView, error: 'Job completed but no result is stored.' },
      { status: 500 }
    );
  }

  const resultBuffer = await getBufferFromR2(job.resultKey);
  if (!resultBuffer) {
    return NextResponse.json(
      { success: false, job: jobView, error: 'Result expired from storage. Please re-run processing.' },
      { status: 404 }
    );
  }

  let result: any;
  try {
    result = JSON.parse(resultBuffer.toString('utf-8'));
  } catch {
    return NextResponse.json(
      { success: false, job: jobView, error: 'Stored result is corrupted. Please re-run processing.' },
      { status: 500 }
    );
  }

  // Best-effort: warm this instance's clip cache so server exports can resolve words.
  try {
    for (const c of result.rankedResult?.rankedClips || []) {
      inMemoryClips.set(c.id, c);
    }
  } catch (_) {}

  return NextResponse.json({
    success: true,
    job: jobView,
    queued: true,
    data: result,
    scoring: result.scoring,
    sourceVideoKey: job.fileKey,
  });
}
