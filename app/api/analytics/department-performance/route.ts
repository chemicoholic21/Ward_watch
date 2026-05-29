import { NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const aggs = {
      by_department: {
        terms: { field: 'department', size: 20 },
        aggs: {
          total: { value_count: { field: 'event_id' } },
          resolved: { filter: { terms: { status: ['resolved', 'closed'] } } },
          overdue: { filter: { term: { is_overdue: true } } },
          avg_days: { avg: { field: 'days_open' } },
          high_priority: { filter: { term: { priority: 'high' } } },
          critical_priority: { filter: { term: { priority: 'critical' } } },
        },
      },
    };

    const result = await esService.aggregate(ES_INDICES.CIVIC_EVENTS, aggs);

    const performance = (result.by_department?.buckets || [])
      .map((b: any) => {
        const total = b.total?.value || 1;
        const resolved = b.resolved?.doc_count || 0;
        const overdue = b.overdue?.doc_count || 0;
        return {
          department: b.key,
          total_complaints: total,
          resolved,
          resolution_rate: Math.round((resolved / total) * 10000) / 100,
          overdue_count: overdue,
          overdue_rate: Math.round((overdue / total) * 10000) / 100,
          avg_resolution_days: Math.round((b.avg_days?.value || 0) * 100) / 100,
          high_priority_count: b.high_priority?.doc_count || 0,
          critical_priority_count: b.critical_priority?.doc_count || 0,
        };
      })
      .sort((a: any, b: any) => b.total_complaints - a.total_complaints);

    return NextResponse.json({ success: true, data: performance });
  } catch (error: any) {
    console.error('Error fetching department performance:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
