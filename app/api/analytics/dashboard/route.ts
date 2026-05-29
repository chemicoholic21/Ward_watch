import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const date_from = req.nextUrl.searchParams.get('date_from') || 'now-30d';

    const [complaintStats, ghostStats, scamStats, zoneMetrics] = await Promise.all([
      esService.aggregate(ES_INDICES.CIVIC_EVENTS, {
        total: { value_count: { field: 'event_id' } },
        by_status: { terms: { field: 'status' } },
        overdue: { filter: { term: { is_overdue: true } } },
        avg_resolution: { avg: { field: 'days_open' } },
        daily_volume: { date_histogram: { field: 'created_at', calendar_interval: 'day' } },
      }, { range: { created_at: { gte: date_from } } }),

      ghostOfficeDetector.calculateGhostScores({ dateRange: { gte: date_from } }),

      esService.aggregate(ES_INDICES.SCAM_REPORTS, {
        total: { value_count: { field: 'report_id' } },
        by_risk_level: { terms: { field: 'risk_level' } },
        by_department: { terms: { field: 'spoofed_department' } },
        avg_trust_score: { avg: { field: 'trust_score' } },
      }, { range: { reported_at: { gte: date_from } } }),

      esService.aggregate(ES_INDICES.CIVIC_EVENTS, {
        by_zone: {
          terms: { field: 'zone', size: 10 },
          aggs: {
            complaints: { value_count: { field: 'event_id' } },
            overdue: { filter: { term: { is_overdue: true } } },
            avg_days: { avg: { field: 'days_open' } },
          },
        },
      }, { range: { created_at: { gte: date_from } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        complaints: {
          total: complaintStats.total?.value || 0,
          by_status: Object.fromEntries((complaintStats.by_status?.buckets || []).map((b: any) => [b.key, b.doc_count])),
          overdue_count: complaintStats.overdue?.doc_count || 0,
          avg_resolution_days: Math.round((complaintStats.avg_resolution?.value || 0) * 100) / 100,
          daily_trend: (complaintStats.daily_volume?.buckets || []).slice(-14).map((b: any) => ({
            date: b.key_as_string,
            count: b.doc_count,
          })),
        },
        ghost_offices: ghostStats.summary,
        scams: {
          total: scamStats.total?.value || 0,
          by_risk_level: Object.fromEntries((scamStats.by_risk_level?.buckets || []).map((b: any) => [b.key, b.doc_count])),
          by_department: Object.fromEntries(
            (scamStats.by_department?.buckets || []).filter((b: any) => b.key).map((b: any) => [b.key, b.doc_count]),
          ),
          avg_trust_score: Math.round((scamStats.avg_trust_score?.value || 0) * 100) / 100,
        },
        zones: (zoneMetrics.by_zone?.buckets || []).map((b: any) => ({
          zone: b.key,
          complaints: b.complaints?.value || b.doc_count,
          overdue: b.overdue?.doc_count || 0,
          avg_resolution_days: Math.round((b.avg_days?.value || 0) * 100) / 100,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
