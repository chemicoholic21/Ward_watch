import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const metric = sp.get('metric') || 'complaints';
    const interval = sp.get('interval') || 'day';
    const date_from = sp.get('date_from') || 'now-30d';
    const department = sp.get('department');
    const zone = sp.get('zone');

    const query: any = { bool: { must: [{ range: { created_at: { gte: date_from } } }], filter: [] } };
    if (department) query.bool.filter.push({ term: { department } });
    if (zone) query.bool.filter.push({ term: { zone } });

    const index = metric === 'scams' ? ES_INDICES.SCAM_REPORTS : ES_INDICES.CIVIC_EVENTS;
    const dateField = metric === 'scams' ? 'reported_at' : 'created_at';

    const aggs = {
      trend: {
        date_histogram: { field: dateField, calendar_interval: interval },
        aggs:
          metric === 'complaints'
            ? {
                resolved: { filter: { terms: { status: ['resolved', 'closed'] } } },
                overdue: { filter: { term: { is_overdue: true } } },
              }
            : {
                high_risk: { filter: { terms: { risk_level: ['high', 'critical'] } } },
              },
      },
    };

    const result = await esService.aggregate(index, aggs as any, query);

    const trend = (result.trend?.buckets || []).map((b: any) => ({
      date: b.key_as_string,
      timestamp: b.key,
      total: b.doc_count,
      ...(metric === 'complaints'
        ? { resolved: b.resolved?.doc_count || 0, overdue: b.overdue?.doc_count || 0 }
        : { high_risk: b.high_risk?.doc_count || 0 }),
    }));

    return NextResponse.json({ success: true, data: { metric, interval, trend } });
  } catch (error: any) {
    console.error('Error fetching trends:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
