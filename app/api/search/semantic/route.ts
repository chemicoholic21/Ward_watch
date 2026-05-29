import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { query, vector, k = 10, filter } = await req.json();

    if (!vector && !query) {
      return NextResponse.json({ success: false, error: 'Either query or vector is required' }, { status: 400 });
    }

    let searchVector = vector;
    if (!searchVector && query) {
      // Mock embedding for demo; in production this should call AWS Bedrock
      searchVector = Array(1536).fill(0).map(() => Math.random() * 2 - 1);
    }

    const results = await esService.vectorSearch(
      ES_INDICES.CIVIC_VECTORS,
      'embedding',
      searchVector,
      { k: parseInt(String(k), 10), filter: filter ? { term: filter } : undefined },
    );

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error in semantic search:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
