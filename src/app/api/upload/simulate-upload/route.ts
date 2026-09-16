import { NextRequest, NextResponse } from 'next/server';
import { inMemoryR2 } from '@/lib/storage/r2';

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key') || `upload-${Date.now()}`;
    const contentType = req.headers.get('content-type') || 'application/octet-stream';

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    inMemoryR2.set(key, {
      buffer,
      contentType,
      uploadedAt: new Date().toISOString(),
    });

    console.log(`[R2 Simulation] Saved file to key "${key}" (${buffer.length} bytes)`);

    return new NextResponse(null, { status: 200 });
  } catch (error: any) {
    console.error('Simulated upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
