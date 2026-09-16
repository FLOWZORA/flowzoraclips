import { NextRequest, NextResponse } from 'next/server';
import { generateSocialCopy, SocialCopyRequest } from '@/lib/pipeline/social-copy';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clipId,
      transcriptSnippet,
      reasoning,
      scriptPreference = 'romanized',
      durationSec = 45,
    } = body;

    if (!transcriptSnippet || typeof transcriptSnippet !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Transcript snippet is required to generate social copy.' },
        { status: 400 }
      );
    }

    const result = await generateSocialCopy({
      clipId: clipId || `clip-${Date.now()}`,
      transcriptSnippet,
      reasoning,
      scriptPreference,
      durationSec,
    });

    return NextResponse.json({
      success: true,
      copy: result,
    });
  } catch (error: any) {
    console.error('Social copy generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate social copy' },
      { status: 500 }
    );
  }
}
