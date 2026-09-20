import { NextRequest, NextResponse } from 'next/server';
import {
  parseYouTubeUrl,
  getYouTubeMetadata,
  extractYouTubeAudioStream,
} from '@/lib/pipeline/youtube';
import { runTextPipeline } from '@/lib/pipeline/pipeline-orchestrator';
import { SourceLanguage, ScriptPreference } from '@/lib/pipeline/types';
import {
  validateProcessingEligibility,
  deductCredit,
  refundCreditOnFailure,
} from '@/lib/billing/credits';
import { checkSpendKillSwitch, recordApiSpend } from '@/lib/billing/kill-switch';
import { inMemoryClips } from '@/lib/pipeline/video-exporter';

// Allow up to 60s runtime for audio streaming, Groq transcription & Gemini highlight ranking
// NOTE: Vercel Hobby plan ignores this and hard-kills at 10-15s. All internal ops must finish < 9s.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Races a promise against a timeout, returning a fallback value on expiry */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * GET: Quick metadata preview when user enters a YouTube URL.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    const { videoId, isValid } = parseYouTubeUrl(url);
    if (!isValid || !videoId) {
      return NextResponse.json(
        { success: false, error: 'Invalid YouTube URL' },
        { status: 400 }
      );
    }

    const metadata = await getYouTubeMetadata(url);

    return NextResponse.json({
      success: true,
      metadata,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch YouTube metadata' },
      { status: 500 }
    );
  }
}

/**
 * POST: Extracts audio from YouTube URL and runs the full highlight ranking pipeline.
 */
export async function POST(req: NextRequest) {
  let activeUserId = 'demo-user-1';
  let videoJobId = `yt-${Date.now()}`;
  let creditDeducted = false;

  /** 9-second hard wall — returns a clean JSON error before Vercel's raw lambda kill at 10-15s */
  const ROUTE_TIMEOUT_MS = 9_000;
  let timeoutReached = false;
  const timeoutSignal = new Promise<NextResponse>((resolve) =>
    setTimeout(() => {
      timeoutReached = true;
      resolve(
        NextResponse.json(
          {
            success: false,
            error:
              "YouTube's cloud bot-detection is restricting direct server playback for this video. " +
              'Please download the audio or video file and upload it directly in the "Upload File" tab for instant clip generation.',
          },
          { status: 504 }
        )
      );
    }, ROUTE_TIMEOUT_MS)
  );

  const workPromise = (async (): Promise<NextResponse> => {
    try {

    // 2. Spend Kill Switch
    const spendStatus = await checkSpendKillSwitch();
    if (spendStatus.isKillSwitchActive) {
      return NextResponse.json(
        {
          success: false,
          error: spendStatus.message || 'Monthly capacity ceiling reached.',
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const {
      url,
      userId = 'demo-user-1',
      language = 'hinglish',
      scriptPreference = 'romanized',
      estimatedDurationSec = 480, // default 8 min
    } = body;
    activeUserId = userId;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'YouTube URL is required.' },
        { status: 400 }
      );
    }

    // 3. Metadata & Duration Check
    const metadata = await getYouTubeMetadata(url, estimatedDurationSec);

    // 4. Validate Credit Balance & Duration Cap (<=10m free)
    const eligibility = await validateProcessingEligibility(activeUserId, metadata.durationSec);
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

    // 5. Extract Audio Stream (pass pre-fetched metadata to avoid redundant getBasicInfo call)
    const { audioBuffer, filename } = await extractYouTubeAudioStream(url, activeUserId, false, metadata);

    // 6. Deduct 1 credit
    const balanceAfterDeduct = await deductCredit(activeUserId, videoJobId);
    creditDeducted = true;

    // 7. Run Highlight Pipeline
    const result = await runTextPipeline({
      audioBuffer,
      filename,
      language: language as SourceLanguage,
      scriptPreference: scriptPreference as ScriptPreference,
    });

    // Cache generated clips so export routes can retrieve word-level timestamps on-demand
    if (result.rankedResult?.rankedClips) {
      for (const c of result.rankedResult.rankedClips) {
        inMemoryClips.set(c.id, c);
      }
    }

    // 8. Record AI Spend
    const durationMinutes = (result.duration || 60) / 60;
    const estimatedCostUsd = Number((durationMinutes * 0.006 + 0.001).toFixed(4));
    await recordApiSpend(estimatedCostUsd);

    return NextResponse.json({
      success: true,
      metadata,
      data: result,
      billing: {
        creditsRemaining: balanceAfterDeduct,
        jobId: videoJobId,
      },
    });
  } catch (error: any) {
    console.error('YouTube ingestion error:', error);

    // Refund credit idempotently if failed
    if (creditDeducted) {
      await refundCreditOnFailure(activeUserId, videoJobId);
      console.log(`[Billing] Refunded 1 credit to ${activeUserId} due to YouTube pipeline error.`);
    }

    return NextResponse.json(
      { success: false, error: error.message || 'YouTube processing failed.' },
      { status: 500 }
    );
  }
  })();

  return Promise.race([workPromise, timeoutSignal]);
}
