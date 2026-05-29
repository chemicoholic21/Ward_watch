import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const department = sp.get('department');
    const zone = sp.get('zone');
    const date_from = sp.get('date_from');

    const query: any = { bool: { must: [{ match_all: {} }], filter: [] } };
    if (department) query.bool.filter.push({ term: { department } });
    if (zone) query.bool.filter.push({ term: { zone } });
    if (date_from) query.bool.filter.push({ range: { created_at: { gte: date_from } } });

    const aggs = {
      by_status: { terms: { field: 'status' } },
      by_department: { terms: { field: 'department', size: 20 } },
      by_priority: { terms: { field: 'priority' } },
      by_zone: { terms: { field: 'zone', size: 10 } },
      overdue_count: { filter: { term: { is_overdue: true } } },
      avg_days_open: { avg: { field: 'days_open' } },
      daily_trend: {
        date_histogram: { field: 'created_at', calendar_interval: 'day' },
      },
    };

    const result = await esService.aggregate(ES_INDICES.CIVIC_EVENTS, aggs, query);
    const total = await esService.count(ES_INDICES.CIVIC_EVENTS, query);

    return NextResponse.json({
      success: true,
      data: {
        total,
        by_status: Object.fromEntries((result.by_status?.buckets || []).map((b: any) => [b.key, b.doc_count])),
        by_department: Object.fromEntries((result.by_department?.buckets || []).map((b: any) => [b.key, b.doc_count])),
        by_priority: Object.fromEntries((result.by_priority?.buckets || []).map((b: any) => [b.key, b.doc_count])),
        by_zone: Object.fromEntries((result.by_zone?.buckets || []).map((b: any) => [b.key, b.doc_count])),
        overdue_count: result.overdue_count?.doc_count || 0,
        avg_days_open: Math.round((result.avg_days_open?.value || 0) * 100) / 100,
        daily_trend: (result.daily_trend?.buckets || []).map((b: any) => ({
          date: b.key_as_string,
          count: b.doc_count,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
