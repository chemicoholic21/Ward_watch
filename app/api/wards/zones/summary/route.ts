import { NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const aggs = {
      by_zone: {
        terms: { field: 'zone', size: 10 },
        aggs: {
          ward_count: { cardinality: { field: 'ward_id' } },
          total_complaints: { value_count: { field: 'event_id' } },
          resolved: { filter: { terms: { status: ['resolved', 'closed'] } } },
          overdue: { filter: { term: { is_overdue: true } } },
          avg_days: { avg: { field: 'days_open' } },
          centroid: { geo_centroid: { field: 'geo_location' } },
        },
      },
    };

    const result = await esService.aggregate(ES_INDICES.CIVIC_EVENTS, aggs);

    const zones = (result.by_zone?.buckets || []).map((b: any) => {
      const total = b.total_complaints?.value || 1;
      const resolved = b.resolved?.doc_count || 0;
      const overdue = b.overdue?.doc_count || 0;
      return {
        zone: b.key,
        ward_count: b.ward_count?.value || 0,
        total_complaints: total,
        resolved,
        overdue,
        resolution_rate: Math.round((resolved / total) * 10000) / 100,
        overdue_rate: Math.round((overdue / total) * 10000) / 100,
        avg_resolution_days: Math.round((b.avg_days?.value || 0) * 100) / 100,
        centroid: b.centroid?.location || null,
      };
    });

    return NextResponse.json({ success: true, data: zones });
  } catch (error: any) {
    console.error('Error fetching zone summary:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
