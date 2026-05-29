import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const zone = sp.get('zone');
    const limit = parseInt(sp.get('limit') || '20', 10);

    const query: any = zone ? { term: { zone } } : { match_all: {} };
    const aggs = {
      by_ward: {
        terms: { field: 'ward_id', size: 200 },
        aggs: {
          ward_name: { terms: { field: 'ward_name.keyword', size: 1 } },
          zone: { terms: { field: 'zone', size: 1 } },
          total: { value_count: { field: 'event_id' } },
          resolved: { filter: { terms: { status: ['resolved', 'closed'] } } },
          overdue: { filter: { term: { is_overdue: true } } },
          avg_days: { avg: { field: 'days_open' } },
        },
      },
    };

    const result = await esService.aggregate(ES_INDICES.CIVIC_EVENTS, aggs, query);

    const leaderboard = (result.by_ward?.buckets || [])
      .map((b: any) => {
        const total = b.total?.value || 1;
        const resolved = b.resolved?.doc_count || 0;
        const overdue = b.overdue?.doc_count || 0;
        const avgDays = b.avg_days?.value || 0;

        const resolutionRate = (resolved / total) * 100;
        const overdueRate = (overdue / total) * 100;
        const score = Math.max(
          0,
          Math.min(100, resolutionRate * 0.4 + (100 - overdueRate) * 0.3 + Math.max(0, ((15 - avgDays) / 15) * 100) * 0.3),
        );

        return {
          ward_id: b.key,
          ward_name: b.ward_name?.buckets?.[0]?.key || b.key,
          zone: b.zone?.buckets?.[0]?.key || 'Unknown',
          score: Math.round(score * 100) / 100,
          grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F',
          metrics: {
            total_complaints: total,
            resolution_rate: Math.round(resolutionRate * 100) / 100,
            overdue_rate: Math.round(overdueRate * 100) / 100,
            avg_resolution_days: Math.round(avgDays * 100) / 100,
          },
        };
      })
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit)
      .map((item: any, index: number) => ({ ...item, rank: index + 1 }));

    return NextResponse.json({ success: true, data: leaderboard });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
