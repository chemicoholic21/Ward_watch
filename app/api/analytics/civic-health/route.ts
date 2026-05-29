import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const zone = req.nextUrl.searchParams.get('zone');
    const query: any = zone ? { bool: { filter: [{ term: { zone } }] } } : { match_all: {} };

    const aggs = {
      by_zone: {
        terms: { field: 'zone', size: 10 },
        aggs: {
          total: { value_count: { field: 'event_id' } },
          resolved: { filter: { terms: { status: ['resolved', 'closed'] } } },
          overdue: { filter: { term: { is_overdue: true } } },
          escalated: { filter: { range: { escalation_count: { gte: 2 } } } },
          avg_days: { avg: { field: 'days_open' } },
        },
      },
    };

    const result = await esService.aggregate(ES_INDICES.CIVIC_EVENTS, aggs, query);

    const healthScores = (result.by_zone?.buckets || [])
      .map((b: any) => {
        const total = b.total?.value || 1;
        const resolved = b.resolved?.doc_count || 0;
        const overdue = b.overdue?.doc_count || 0;
        const escalated = b.escalated?.doc_count || 0;
        const avgDays = b.avg_days?.value || 0;

        const resolutionRate = (resolved / total) * 100;
        const overdueRate = (overdue / total) * 100;
        const escalationRate = (escalated / total) * 100;
        const speedFactor = Math.max(0, 100 - avgDays * 2);

        const healthScore = Math.max(
          0,
          Math.min(
            100,
            resolutionRate * 0.4 +
              (100 - overdueRate) * 0.25 +
              (100 - escalationRate) * 0.20 +
              speedFactor * 0.15,
          ),
        );

        return {
          zone: b.key,
          health_score: Math.round(healthScore * 100) / 100,
          grade: healthScore >= 80 ? 'A' : healthScore >= 60 ? 'B' : healthScore >= 40 ? 'C' : healthScore >= 20 ? 'D' : 'F',
          metrics: {
            total_complaints: total,
            resolution_rate: Math.round(resolutionRate * 100) / 100,
            overdue_rate: Math.round(overdueRate * 100) / 100,
            escalation_rate: Math.round(escalationRate * 100) / 100,
            avg_resolution_days: Math.round(avgDays * 100) / 100,
          },
        };
      })
      .sort((a: any, b: any) => b.health_score - a.health_score);

    return NextResponse.json({ success: true, data: healthScores });
  } catch (error: any) {
    console.error('Error fetching civic health:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
