import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

function generateRecommendations(overall: number, resolution: number, overdue: number, avgDays: number): string[] {
  const recommendations: string[] = [];
  if (resolution < 50) recommendations.push('Critical: Resolution rate below 50%. Consider filing RTI to understand bottlenecks.');
  if (overdue > 30) recommendations.push('High overdue rate. Escalate pending complaints to department heads.');
  if (avgDays > 14) recommendations.push('Average resolution time exceeds 2 weeks. File formal complaint with Lokayukta.');
  if (overall < 40) recommendations.push('Overall civic health poor. Consider organizing community awareness campaigns.');
  if (recommendations.length === 0) recommendations.push('Performance within acceptable range. Continue monitoring.');
  return recommendations;
}

export async function POST(req: NextRequest) {
  try {
    const { zone, department, date_from = 'now-30d' } = await req.json();

    const query: any = { bool: { must: [{ range: { created_at: { gte: date_from } } }], filter: [] } };
    if (zone) query.bool.filter.push({ term: { zone } });
    if (department) query.bool.filter.push({ term: { department } });

    const aggs = {
      total: { value_count: { field: 'event_id' } },
      resolved: { filter: { terms: { status: ['resolved', 'closed'] } } },
      overdue: { filter: { term: { is_overdue: true } } },
      avg_days: { avg: { field: 'days_open' } },
      by_category: { terms: { field: 'category', size: 10 } },
      by_priority: { terms: { field: 'priority' } },
      escalated: { filter: { range: { escalation_count: { gte: 2 } } } },
    };

    const result = await esService.aggregate(ES_INDICES.CIVIC_EVENTS, aggs, query);

    const total = result.total?.value || 0;
    const resolved = result.resolved?.doc_count || 0;
    const overdue = result.overdue?.doc_count || 0;
    const avgDays = result.avg_days?.value || 0;
    const escalated = result.escalated?.doc_count || 0;

    const resolutionRate = total > 0 ? (resolved / total) * 100 : 0;
    const overdueRate = total > 0 ? (overdue / total) * 100 : 0;
    const overallScore = Math.max(
      0,
      Math.min(100, resolutionRate * 0.4 + (100 - overdueRate) * 0.3 + Math.max(0, ((15 - avgDays) / 15) * 100) * 0.3),
    );

    const getGrade = (score: number) =>
      score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';

    return NextResponse.json({
      success: true,
      data: {
        type: 'CITIZEN_REPORT_CARD',
        generated_at: new Date().toISOString(),
        period: date_from,
        scope: { zone: zone || 'All Zones', department: department || 'All Departments' },
        metrics: {
          total_complaints: total,
          resolved,
          pending: total - resolved,
          overdue,
          avg_resolution_days: Math.round(avgDays * 100) / 100,
          escalation_rate: total > 0 ? Math.round((escalated / total) * 10000) / 100 : 0,
        },
        scores: {
          overall: Math.round(overallScore * 100) / 100,
          grade: getGrade(overallScore),
          resolution_rate: Math.round(resolutionRate * 100) / 100,
          timeliness: Math.round((100 - overdueRate) * 100) / 100,
          speed: Math.round(Math.max(0, ((15 - avgDays) / 15) * 100) * 100) / 100,
        },
        top_categories: (result.by_category?.buckets || []).map((b: any) => ({
          category: b.key,
          count: b.doc_count,
        })),
        recommendations: generateRecommendations(overallScore, resolutionRate, overdueRate, avgDays),
      },
    });
  } catch (error: any) {
    console.error('Error generating report card:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
