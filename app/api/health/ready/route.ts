import { NextResponse } from 'next/server';
import { mongoService } from '@/lib/server/services/mongodb/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await mongoService.health();
    return NextResponse.json({ ready: true, timestamp: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json(
      { ready: false, timestamp: new Date().toISOString(), error: error?.message },
      { status: 503 },
    );
  }
}
