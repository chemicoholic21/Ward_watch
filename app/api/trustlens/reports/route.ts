import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const risk_level = sp.get('risk_level');
    const scam_type = sp.get('scam_type');
    const department = sp.get('department');
    const date_from = sp.get('date_from');
    const date_to = sp.get('date_to');
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '20', 10);

    const query: any = { bool: { must: [{ match_all: {} }], filter: [] } };
    if (risk_level) query.bool.filter.push({ term: { risk_level } });
    if (scam_type) query.bool.filter.push({ term: { scam_type } });
    if (department) query.bool.filter.push({ term: { spoofed_department: department } });

    if (date_from || date_to) {
      query.bool.filter.push({
        range: {
          reported_at: {
            ...(date_from && { gte: date_from }),
            ...(date_to && { lte: date_to }),
          },
        },
      });
    }

    const result = await esService.search(ES_INDICES.SCAM_REPORTS, query, {
      size: limit,
      from: (page - 1) * limit,
      sort: [{ reported_at: 'desc' }] as any,
    });

    return NextResponse.json({
      success: true,
      data: result.hits,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
