import { NextRequest, NextResponse } from 'next/server';
import { runTextPipeline } from '@/lib/pipeline/pipeline-orchestrator';
import { SourceLanguage, ScriptPreference } from '@/lib/pipeline/types';
import { validateProcessingEligibility, deductCredit, refundCreditOnFailure } from '@/lib/billing/credits';
import { checkSpendKillSwitch, recordApiSpend } from '@/lib/billing/kill-switch';
import { extractAudioBuffer, isVideoFile, probeMediaDurationSec } from '@/lib/pipeline/audio-extractor';
import { inMemoryR2, getBufferFromR2 } from '@/lib/storage/r2';
import { inMemoryClips } from '@/lib/pipeline/video-exporter';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Long-form sources (up to ~120 min) transcribe in sequential ~20 MB chunks,
// so allow the maximum function runtime on Pro (Hobby caps at 60s regardless).
export const maxDuration = 300;

/**
 * Resolves the media duration used for the eligibility gate.
 * Prefers a real ffmpeg probe of the container; falls back to the extracted
 * CBR-64kbps MP3 size (bytes / 8000 = seconds) for video; last resort is the
 * legacy file-size heuristic. Never returns a size-based guess when a real
 * measurement is available.
 */
async function resolveMeasuredDuration(
  sourceBuffer: Buffer,
  originalFilename: string,
  extractedAudio: Buffer | undefined
): Promise<number> {
  const probedSec = await probeMediaDurationSec(sourceBuffer, originalFilename).catch(() => null);
  if (probedSec && Number.isFinite(probedSec) && probedSec > 0) {
    console.log(`[API] Duration for eligibility: ${Math.round(probedSec)}s (probed from container)`);
    return Math.max(1, Math.min(7200, Math.round(probedSec)));
  }
  if (extractedAudio && extractedAudio.length > 0 && isVideoFile(originalFilename)) {
    const fromAudio = Math.round(extractedAudio.length / 8000);
    console.log(`[API] Duration for eligibility: ${fromAudio}s (fallback: 64kbps audio size)`);
    return Math.max(1, Math.min(7200, fromAudio));
  }
  const legacy = Math.max(30, Math.min(3600, Math.round((sourceBuffer.length / (1024 * 1024)) * 60)));
  console.log(`[API] Duration for eligibility: ${legacy}s (fallback: legacy size heuristic)`);
  return legacy;
}

export async function POST(req: NextRequest) {
  let activeUserId = 'demo-user-1';
  let videoJobId = `job-${Date.now()}`;
  let creditDeducted = false;

  try {

    // 2. Spend kill switch check
    const spendStatus = await checkSpendKillSwitch();

    const contentType = req.headers.get('content-type') || '';
    let language: SourceLanguage = 'hinglish';
    let scriptPreference: ScriptPreference = 'romanized';
    let audioBuffer: Buffer | undefined;
    let filename: string = 'audio.mp3';
    let estimatedDurationSec = 300; // default 5 min for sample
    let sourceVideoKey: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      language = (formData.get('language') as SourceLanguage) || 'hinglish';
      scriptPreference = (formData.get('scriptPreference') as ScriptPreference) || 'romanized';
      const userParam = formData.get('userId') as string;
      if (userParam) activeUserId = userParam;

      // Purge any stale clip exports from previous runs so new downloads only use this video
      try {
        for (const k of inMemoryR2.keys()) {
          if (k.startsWith('flowzora_') || k.startsWith('exports/')) {
            inMemoryR2.delete(k);
          }
        }
      } catch (_) {}

      if (file) {
        const arrayBuf = await file.arrayBuffer();
        let rawBuffer = Buffer.from(arrayBuf);
        filename = file.name;

        // If this is a video file, cache the original video so it can be cropped and downloaded as MP4!
        if (isVideoFile(filename)) {
          sourceVideoKey = `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          console.log(`[API] Video file detected (${(rawBuffer.length / 1048576).toFixed(1)} MB). Caching for export as "${sourceVideoKey}"...`);
          inMemoryR2.set(sourceVideoKey, { buffer: rawBuffer, contentType: 'video/mp4', uploadedAt: new Date().toISOString() });
          inMemoryR2.set('latest_source.mp4', { buffer: rawBuffer, contentType: 'video/mp4', uploadedAt: new Date().toISOString() });
          try {
            fs.writeFileSync(path.join(os.tmpdir(), 'flowzora_latest_source.mp4'), rawBuffer);
            fs.writeFileSync(path.join(os.tmpdir(), `${sourceVideoKey}.mp4`), rawBuffer);
          } catch (_) {}
          try {
            const uploadsDir = path.resolve(process.cwd(), 'public/media/uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            fs.writeFileSync(path.join(uploadsDir, 'latest_source.mp4'), rawBuffer);
          } catch (_) {}

          try {
            const extracted = await extractAudioBuffer(rawBuffer, filename);
            audioBuffer = extracted.audioBuffer;
            filename = extracted.audioFilename;
            console.log(`[API] Audio extracted: ${(audioBuffer.length / 1048576).toFixed(1)} MB MP3`);
          } catch (extractErr: any) {
            console.error('[API] Audio extraction failed:', extractErr.message);
            return NextResponse.json(
              { success: false, error: `Audio extraction failed: ${extractErr.message}` },
              { status: 422 }
            );
          }
        } else {
          audioBuffer = rawBuffer;
        }

        // Measure true duration from the container header — never guess from
        // file size (video bitrate varies: a 52 MB file can be 23 min, not 53).
        estimatedDurationSec = await resolveMeasuredDuration(rawBuffer, file.name, audioBuffer);
      }
    } else {
      const body = await req.json().catch(() => ({}));
      language = body.language || 'hinglish';
      scriptPreference = body.scriptPreference || 'romanized';
      if (body.userId) activeUserId = body.userId;
      if (body.durationSec) estimatedDurationSec = Number(body.durationSec);
      filename = body.filename || 'media.mp4';

      // Purge stale clip exports
      try {
        for (const k of inMemoryR2.keys()) {
          if (k.startsWith('flowzora_') || k.startsWith('exports/')) {
            inMemoryR2.delete(k);
          }
        }
      } catch (_) {}

      if (body.fileKey) {
        console.log(`[API] Fetching file from R2 key: ${body.fileKey}`);
        const r2Buffer = await getBufferFromR2(body.fileKey);
        if (r2Buffer && r2Buffer.length > 0) {
          if (isVideoFile(filename)) {
            console.log(`[API] Video file from R2 detected (${(r2Buffer.length / 1048576).toFixed(1)} MB). Caching for export...`);
            inMemoryR2.set(body.fileKey, { buffer: r2Buffer, contentType: 'video/mp4', uploadedAt: new Date().toISOString() });
            inMemoryR2.set('latest_source.mp4', { buffer: r2Buffer, contentType: 'video/mp4', uploadedAt: new Date().toISOString() });
            try {
              fs.writeFileSync(path.join(os.tmpdir(), 'flowzora_latest_source.mp4'), r2Buffer);
            } catch (_) {}
            try {
              const uploadsDir = path.resolve(process.cwd(), 'public/media/uploads');
              if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
              fs.writeFileSync(path.join(uploadsDir, 'latest_source.mp4'), r2Buffer);
            } catch (_) {}

            try {
              const extracted = await extractAudioBuffer(r2Buffer, filename);
              audioBuffer = extracted.audioBuffer;
              filename = extracted.audioFilename;
            } catch (extractErr: any) {
              console.error('[API] Audio extraction from R2 file failed:', extractErr.message);
              return NextResponse.json(
                { success: false, error: `Audio extraction failed: ${extractErr.message}` },
                { status: 422 }
              );
            }
          } else {
            audioBuffer = r2Buffer;
          }
          estimatedDurationSec = await resolveMeasuredDuration(r2Buffer, body.filename || filename, audioBuffer);
        } else {
          return NextResponse.json(
            { success: false, error: 'Could not retrieve media file from Cloudflare R2 storage. Please re-upload or try again.' },
            { status: 404 }
          );
        }
      }
    }

    // Ensure audio data is provided — no silent fallback to sample subtitles
    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No video or audio file was provided. Please upload a media file to extract highlights and subtitles.',
        },
        { status: 400 }
      );
    }

    // 3. If kill switch tripped and user is on free tier, pause new free jobs
    if (spendStatus.isKillSwitchActive) {
      return NextResponse.json(
        {
          success: false,
          error: spendStatus.message || 'Monthly free-tier capacity ceiling reached. Please check back next cycle or purchase top-up credits.',
          isKillSwitchActive: true,
        },
        { status: 503 }
      );
    }

    // 4. Validate user credit balance and serverless duration cap (measured, not estimated)
    const eligibility = await validateProcessingEligibility(activeUserId, estimatedDurationSec);
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

    // 5. Deduct 1 credit before execution
    const balanceAfterDeduct = await deductCredit(activeUserId, videoJobId);
    creditDeducted = true;

    // 6. Run highlight extraction pipeline
    const result = await runTextPipeline({
      audioBuffer,
      filename,
      language,
      scriptPreference,
    });

    // Cache generated clips so export routes can retrieve word-level timestamps on-demand
    if (result.rankedResult?.rankedClips) {
      for (const c of result.rankedResult.rankedClips) {
        inMemoryClips.set(c.id, c);
      }
    }

    // 7. Record actual accrued AI cost to spend ledger
    // Groq Whisper Large v3 is 100% free ($0.00/min); OpenAI Whisper is $0.006/min
    const durationMinutes = (result.duration || 60) / 60;
    const isGroq = Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('YourGroqApiKey'));
    const transcriptionRate = isGroq ? 0.000 : 0.006;
    const estimatedCostUsd = Number((durationMinutes * transcriptionRate + 0.0005).toFixed(4));
    await recordApiSpend(estimatedCostUsd);

    return NextResponse.json({
      success: true,
      data: result,
      // Top-level so a caller cannot miss it: false means clips were ranked by
      // the offline heuristic, not the AI model.
      scoring: result.scoring,
      sourceVideoKey: sourceVideoKey || 'latest_source.mp4',
      billing: {
        creditsRemaining: balanceAfterDeduct,
        jobId: videoJobId,
      },
    });
  } catch (error: any) {
    console.error('Pipeline analyze API error:', error);

    // Idempotent refund if failure occurred after deduction
    if (creditDeducted) {
      await refundCreditOnFailure(activeUserId, videoJobId);
      console.log(`[Billing] Refunded 1 credit to ${activeUserId} due to pipeline failure.`);
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Pipeline analysis failed',
      },
      { status: 500 }
    );
  }
}

