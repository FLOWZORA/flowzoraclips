import { NextRequest, NextResponse } from 'next/server';
import { runTextPipeline } from '@/lib/pipeline/pipeline-orchestrator';
import { SourceLanguage, ScriptPreference } from '@/lib/pipeline/types';
import { validateProcessingEligibility, deductCredit, refundCreditOnFailure } from '@/lib/billing/credits';
import { checkSpendKillSwitch, recordApiSpend, checkRateLimit } from '@/lib/billing/kill-switch';

export async function POST(req: NextRequest) {
  let activeUserId = 'demo-user-1';
  let videoJobId = `job-${Date.now()}`;
  let creditDeducted = false;

  try {
    // 1. Rate limit check by client IP
    const forwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
    const rateLimit = checkRateLimit(clientIp);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Hourly rate limit reached (5 analyses / hour). Please wait a bit or upgrade your account.',
        },
        { status: 429 }
      );
    }

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
        audioBuffer = Buffer.from(arrayBuf);
        filename = file.name;
        // Approximation: ~1MB mp3 is roughly 1 min (60s)
        estimatedDurationSec = Math.max(30, Math.min(3600, Math.round((file.size / (1024 * 1024)) * 60)));
      }
    } else {
      const body = await req.json().catch(() => ({}));
      language = body.language || 'hinglish';
      scriptPreference = body.scriptPreference || 'romanized';
      if (body.userId) activeUserId = body.userId;
      if (body.durationSec) estimatedDurationSec = Number(body.durationSec);
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

