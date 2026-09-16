import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl } from '@/lib/storage/r2';
import { validateProcessingEligibility } from '@/lib/billing/credits';

const ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov
  'audio/mpeg', // .mp3
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
];

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB ceiling

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      filename,
      contentType,
      fileSize,
      userId = 'demo-user-1',
      estimatedDurationSec = 300,
    } = body;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Filename is required.' },
        { status: 400 }
      );
    }

    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase())) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: "${contentType}". Please upload MP4, MOV, MP3, or WAV files.`,
        },
        { status: 400 }
      );
    }

    if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `File size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 500MB.`,
        },
        { status: 400 }
      );
    }

    // Validate user eligibility (free tier cap <=10 min)
    const eligibility = await validateProcessingEligibility(userId, estimatedDurationSec);
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

    const presigned = await getPresignedUploadUrl({
      userId,
      filename,
      contentType,
    });

    return NextResponse.json({
      success: true,
      uploadUrl: presigned.uploadUrl,
      fileKey: presigned.fileKey,
      publicUrl: presigned.publicUrl,
      isSimulated: presigned.isSimulated,
    });
  } catch (error: any) {
    console.error('Presigned upload URL generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
