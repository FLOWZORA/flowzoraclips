import { NextResponse } from 'next/server';
import { getUsageSummary } from '@/lib/usage/usage-tracker';

/**
 * GET /api/usage — today's estimated consumption per AI provider with
 * remaining quota and seconds until the midnight-PT reset.
 * Estimates only: free tiers expose no "quota left" endpoint.
 */
export async function GET() {
  try {
    const summary = await getUsageSummary();
    return NextResponse.json({ success: true, ...summary });
  } catch (error: any) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve usage' },
      { status: 500 }
    );
  }
}
