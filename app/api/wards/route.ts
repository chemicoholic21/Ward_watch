import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const zone = sp.get('zone');
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '50', 10);

    const query: any = zone ? { term: { zone } } : { match_all: {} };

    const result = await esService.search(ES_INDICES.WARD_METRICS, query, {
      size: limit,
      from: (page - 1) * limit,
      sort: [{ ward_number: 'asc' }] as any,
    });

    return NextResponse.json({
      success: true,
      data: result.hits,
      pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
    });
  } catch (error: any) {
    console.error('Error fetching wards:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
