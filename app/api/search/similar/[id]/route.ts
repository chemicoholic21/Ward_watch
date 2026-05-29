import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '5', 10);

    const sourceDoc = await esService.get<any>(ES_INDICES.CIVIC_EVENTS, params.id);
    if (!sourceDoc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    const query = {
      more_like_this: {
        fields: ['title', 'description', 'category'],
        like: [{ _index: ES_INDICES.CIVIC_EVENTS, _id: params.id }],
        min_term_freq: 1,
        min_doc_freq: 1,
        max_query_terms: 25,
      },
    };

    const result = await esService.search(ES_INDICES.CIVIC_EVENTS, query, { size: limit });

    return NextResponse.json({ success: true, source: sourceDoc, similar: result.hits });
  } catch (error: any) {
    console.error('Error finding similar:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
