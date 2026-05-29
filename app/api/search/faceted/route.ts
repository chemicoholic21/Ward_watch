import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const {
      query: searchQuery,
      filters = {},
      facets = ['department', 'status', 'zone', 'priority'],
      page = 1,
      limit = 20,
    } = await req.json();

    const query: any = {
      bool: {
        must: searchQuery
          ? [{ multi_match: { query: searchQuery, fields: ['title^2', 'description', 'category'] } }]
          : [{ match_all: {} }],
        filter: [],
      },
    };

    for (const [field, value] of Object.entries(filters)) {
      if (value) query.bool.filter.push({ term: { [field]: value } });
    }

    const aggs: any = {};
    for (const facet of facets) {
      aggs[facet] = { terms: { field: facet, size: 20 } };
    }

    const result = await esService.search(ES_INDICES.CIVIC_EVENTS, query, {
      size: limit,
      from: (page - 1) * limit,
      aggs,
    });

    const formattedFacets: Record<string, Array<{ value: string; count: number }>> = {};
    for (const facet of facets) {
      formattedFacets[facet] = (result.aggregations?.[facet]?.buckets || []).map((b: any) => ({
        value: b.key,
        count: b.doc_count,
      }));
    }

    return NextResponse.json({
      success: true,
      data: result.hits,
      facets: formattedFacets,
      pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
    });
  } catch (error: any) {
    console.error('Error in faceted search:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
