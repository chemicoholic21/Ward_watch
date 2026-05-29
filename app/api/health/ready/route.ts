import { NextResponse } from 'next/server';
import { getElasticsearchClient } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getElasticsearchClient().ping();
    return NextResponse.json({ ready: true, timestamp: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json(
      { ready: false, timestamp: new Date().toISOString(), error: error?.message },
      { status: 503 },
    );
  }
}
