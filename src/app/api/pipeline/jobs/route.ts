import { NextRequest, NextResponse } from 'next/server';
import { runTextPipeline } from '@/lib/pipeline/pipeline-orchestrator';
import { SourceLanguage, ScriptPreference } from '@/lib/pipeline/types';
import { validateProcessingEligibility, deductCredit, refundCreditOnFailure } from '@/lib/billing/credits';
import { checkSpendKillSwitch, recordApiSpend } from '@/lib/billing/kill-switch';
import { extractAudioBuffer, isVideoFile, probeMediaDurationSec } from '@/lib/pipeline/audio-extractor';
import { inMemoryR2, getBufferFromR2, uploadBufferToR2 } from '@/lib/storage/r2';
import { inMemoryClips } from '@/lib/pipeline/video-exporter';
import { createJob, updateJob } from '@/lib/jobs/store';
import { inngest, isInngestConfigured, PROCESS_VIDEO_EVENT } from '@/inngest/client';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const maxDuration = 300;

/**
 * Enqueue a background highlight-extraction job for long videos (up to ~3h).
 *
 * Body: { fileKey, filename, language, scriptPreference, userId, estimatedDurationSec? }
 *
 * - Inngest configured → deducts 1 credit, creates a queued job, returns { queued: true, jobId }.
 * - Inngest NOT configured (local dev / no keys) → runs the pipeline inline in
 *   this request and returns { queued: false, jobId, data } (same shape as
 *   /api/pipeline/analyze). Long videos will hit serverless timeouts in this
 *   mode — the queue is required for multi-hour sources.
 */
export async function POST(req: NextRequest) {
  let activeUserId = 'demo-user-1';
  let billingJobId = `job-${Date.now()}`;
  let creditDeducted = false;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      fileKey,
      filename = 'media.mp4',
      language = 'auto',
      scriptPreference = 'romanized',
      userId,
      estimatedDurationSec,
    } = body;
    if (userId) activeUserId = userId;

    if (!fileKey || typeof fileKey !== 'string') {
      return NextResponse.json(
        { success: false, error: 'fileKey is required. Upload the media to storage first.' },
        { status: 400 }
      );
    }

    const spendStatus = await checkSpendKillSwitch();
    if (spendStatus.isKillSwitchActive) {
      return NextResponse.json(
        {
          success: false,
          error: spendStatus.message || 'Monthly free-tier capacity ceiling reached.',
          isKillSwitchActive: true,
        },
        { status: 503 }
      );
    }

    // Duration for the eligibility gate: prefer the client-probed real duration,
    // otherwise measure server-side from the stored media.
    let durationSec = Number(estimatedDurationSec) || 0;
    if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) {
      const probeBuffer = await getBufferFromR2(fileKey);
      if (!probeBuffer) {
        return NextResponse.json(
          { success: false, error: 'Could not retrieve media file from storage. Please re-upload.' },
          { status: 404 }
        );
      }
      const probed = await probeMediaDurationSec(probeBuffer, filename).catch(() => null);
      durationSec = probed && probed > 0 ? Math.round(probed) : 300;
    }

    const eligibility = await validateProcessingEligibility(activeUserId, durationSec);
    if (!eligibility.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: eligibility.reason,
          creditsRemaining: eligibility.creditsRemaining,
          plan: eligibility.plan,
        },
        { status: 403 }
      );
    }

    await deductCredit(activeUserId, billingJobId);
    creditDeducted = true;

    const job = await createJob({
      userId: activeUserId,
      fileKey,
      filename,
      language,
      scriptPreference,
      durationSec,
      billingJobId,
    });

    // ---- Queue path ----
    if (isInngestConfigured()) {
      await inngest.send({
        name: PROCESS_VIDEO_EVENT,
        data: {
          jobId: job.id,
          userId: activeUserId,
          fileKey,
          filename,
          language,
          scriptPreference,
          billingJobId,
        },
      });
      return NextResponse.json({ success: true, queued: true, jobId: job.id });
    }

    // ---- Inline fallback (no queue configured): same work, same request ----
    console.log('[Jobs] Inngest not configured — running pipeline inline (sync fallback).');
    await updateJob(job.id, { status: 'extracting', progress: 5, stageDetail: 'Extracting audio…' });

    const r2Buffer = await getBufferFromR2(fileKey);
    if (!r2Buffer || r2Buffer.length === 0) {
      throw new Error('Could not retrieve media file from storage. Please re-upload.');
    }

    // Cache the source video for later clip exports (mirrors analyze route).
    if (isVideoFile(filename)) {
      inMemoryR2.set(fileKey, { buffer: r2Buffer, contentType: 'video/mp4', uploadedAt: new Date().toISOString() });
      inMemoryR2.set('latest_source.mp4', { buffer: r2Buffer, contentType: 'video/mp4', uploadedAt: new Date().toISOString() });
      try {
        fs.writeFileSync(path.join(os.tmpdir(), 'flowzora_latest_source.mp4'), r2Buffer);
      } catch (_) {}
    }

    let audioBuffer: Buffer;
    let audioFilename = filename;
    if (isVideoFile(filename)) {
      try {
        const extracted = await extractAudioBuffer(r2Buffer, filename);
        audioBuffer = extracted.audioBuffer;
        audioFilename = extracted.audioFilename;
      } catch (extractErr: any) {
        throw new Error(`Audio extraction failed: ${extractErr.message}`);
      }
    } else {
      audioBuffer = r2Buffer;
    }

    await updateJob(job.id, { status: 'transcribing', progress: 30, stageDetail: 'Transcribing…' });
    const result = await runTextPipeline({
      audioBuffer,
      filename: audioFilename,
      language: language as SourceLanguage,
      scriptPreference: scriptPreference as ScriptPreference,
    });

    for (const c of result.rankedResult?.rankedClips || []) {
      inMemoryClips.set(c.id, c);
    }

    const resultKey = `jobs/${job.id}/result.json`;
    await uploadBufferToR2(resultKey, Buffer.from(JSON.stringify(result), 'utf-8'), 'application/json');
    await updateJob(job.id, { status: 'completed', progress: 100, stageDetail: '', resultKey });

    const durationMinutes = (result.duration || 60) / 60;
    const isGroq = Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('YourGroqApiKey'));
    await recordApiSpend(Number((durationMinutes * (isGroq ? 0 : 0.006) + 0.0005).toFixed(4))).catch(() => {});

    return NextResponse.json({
      success: true,
      queued: false,
      jobId: job.id,
      data: result,
      scoring: result.scoring,
      sourceVideoKey: fileKey,
    });
  } catch (error: any) {
    console.error('Jobs enqueue error:', error);
    if (creditDeducted) {
      await refundCreditOnFailure(activeUserId, billingJobId).catch(() => {});
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to start processing job' },
      { status: 500 }
    );
  }
}
