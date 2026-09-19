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

// Allow up to 60s runtime for audio streaming, Groq transcription & Gemini highlight ranking
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

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

    // 5. Extract Audio Stream
    const { audioBuffer, filename } = await extractYouTubeAudioStream(url, activeUserId, false);

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
}
