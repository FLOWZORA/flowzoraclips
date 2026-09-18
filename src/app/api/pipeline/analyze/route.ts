import { NextRequest, NextResponse } from 'next/server';
import { runTextPipeline } from '@/lib/pipeline/pipeline-orchestrator';
import { SourceLanguage, ScriptPreference } from '@/lib/pipeline/types';
import { validateProcessingEligibility, deductCredit, refundCreditOnFailure } from '@/lib/billing/credits';
import { checkSpendKillSwitch, recordApiSpend } from '@/lib/billing/kill-switch';
import { extractAudioBuffer, isVideoFile } from '@/lib/pipeline/audio-extractor';
import { getBufferFromR2 } from '@/lib/storage/r2';

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

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      language = (formData.get('language') as SourceLanguage) || 'hinglish';
      scriptPreference = (formData.get('scriptPreference') as ScriptPreference) || 'romanized';
      const userParam = formData.get('userId') as string;
      if (userParam) activeUserId = userParam;

      if (file) {
        const arrayBuf = await file.arrayBuffer();
        let rawBuffer = Buffer.from(arrayBuf);
        filename = file.name;

        // If this is a video file, extract the audio-only stream first.
        // This compresses a 100+ MB MP4 to a ~3 MB MP3 so it fits Groq's 25 MB limit.
        if (isVideoFile(filename)) {
          console.log(`[API] Video file detected (${(rawBuffer.length / 1048576).toFixed(1)} MB). Extracting audio stream...`);
          try {
            const extracted = await extractAudioBuffer(rawBuffer, filename);
            audioBuffer = extracted.audioBuffer;
            filename = extracted.audioFilename;
            console.log(`[API] Audio extracted: ${(audioBuffer.length / 1048576).toFixed(1)} MB MP3`);
          } catch (extractErr: any) {
            console.error('[API] Audio extraction failed:', extractErr.message);
            // Surface the error to the user instead of falling back silently
            return NextResponse.json(
              { success: false, error: `Audio extraction failed: ${extractErr.message}` },
              { status: 422 }
            );
          }
        } else {
          audioBuffer = rawBuffer;
        }

        // Estimate duration: MP3 at 64kbps is ~0.5 MB/min; raw video ~10-50 MB/min
        // Use 1 MB/min as a safe lower bound
        estimatedDurationSec = Math.max(30, Math.min(3600, Math.round((file.size / (1024 * 1024)) * 60)));
      }
    } else {
      const body = await req.json().catch(() => ({}));
      language = body.language || 'hinglish';
      scriptPreference = body.scriptPreference || 'romanized';
      if (body.userId) activeUserId = body.userId;
      if (body.durationSec) estimatedDurationSec = Number(body.durationSec);
      filename = body.filename || 'media.mp4';

      if (body.fileKey) {
        console.log(`[API] Fetching file from R2 key: ${body.fileKey}`);
        const r2Buffer = await getBufferFromR2(body.fileKey);
        if (r2Buffer && r2Buffer.length > 0) {
          if (isVideoFile(filename)) {
            console.log(`[API] Video file from R2 detected (${(r2Buffer.length / 1048576).toFixed(1)} MB). Extracting audio...`);
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
          estimatedDurationSec = Math.max(30, Math.min(3600, Math.round((r2Buffer.length / (1024 * 1024)) * 60)));
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

    // 4. Validate user credit balance and <=10 min free cap
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

