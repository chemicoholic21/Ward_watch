import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get('q');
    const field = sp.get('field') || 'title';
    const size = parseInt(sp.get('size') || '5', 10);

    if (!q) {
      return NextResponse.json({ success: false, error: 'Query (q) is required' }, { status: 400 });
    }

    const query = {
      match_phrase_prefix: {
        [field]: { query: q, max_expansions: size * 2 },
      },
    };

    const result = await esService.search(ES_INDICES.CIVIC_EVENTS, query, {
      size,
      _source: [field, 'department', 'ward_name', 'status'],
    });

    return NextResponse.json({
      success: true,
      suggestions: result.hits.map((hit: any) => ({
        text: hit[field],
        department: hit.department,
        ward: hit.ward_name,
      })),
    });
  } catch (error: any) {
    console.error('Error in suggest:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
