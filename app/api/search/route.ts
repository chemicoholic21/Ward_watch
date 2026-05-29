import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get('q');
    const indexParam = sp.get('index');
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '20', 10);
    const sort_by = sp.get('sort_by');
    const sort_order = sp.get('sort_order') || 'desc';

    if (!q) {
      return NextResponse.json({ success: false, error: 'Search query (q) is required' }, { status: 400 });
    }

    const searchIndices = indexParam ? [indexParam] : [ES_INDICES.CIVIC_EVENTS, ES_INDICES.SCAM_REPORTS];

    const query = {
      multi_match: {
        query: q,
        fields: [
          'title^3',
          'description^2',
          'content^2',
          'category',
          'department',
          'ward_name',
          'address',
          'explanation',
        ],
        type: 'best_fields' as const,
        fuzziness: 'AUTO',
      },
    };

    const results = await Promise.all(
      searchIndices.map(idx =>
        esService.search(idx, query, {
          size: limit,
          from: (page - 1) * limit,
          sort: sort_by ? ([{ [sort_by]: sort_order }] as any) : undefined,
        }),
      ),
    );

    const allHits = results.flatMap((r, i) =>
      r.hits.map((hit: any) => ({ ...hit, _index: searchIndices[i] })),
    );
    const totalHits = results.reduce((sum, r) => sum + r.total, 0);

    return NextResponse.json({
      success: true,
      data: allHits.slice(0, limit),
      pagination: { page, limit, total: totalHits, pages: Math.ceil(totalHits / limit) },
      indices_searched: searchIndices,
    });
  } catch (error: any) {
    console.error('Error searching:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
