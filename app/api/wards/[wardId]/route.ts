import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { wardId: string } }) {
  try {
    const ward = await esService.get(ES_INDICES.WARD_METRICS, params.wardId);
    if (!ward) {
      return NextResponse.json({ success: false, error: 'Ward not found' }, { status: 404 });
    }

    const complaintStats = await esService.aggregate(
      ES_INDICES.CIVIC_EVENTS,
      {
        by_status: { terms: { field: 'status' } },
        by_department: { terms: { field: 'department', size: 10 } },
        by_category: { terms: { field: 'category', size: 10 } },
        overdue: { filter: { term: { is_overdue: true } } },
        avg_days: { avg: { field: 'days_open' } },
      },
      { term: { ward_id: params.wardId } },
    );

    const totalComplaints = await esService.count(ES_INDICES.CIVIC_EVENTS, {
      term: { ward_id: params.wardId },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...ward,
        complaint_stats: {
          total: totalComplaints,
          by_status: Object.fromEntries((complaintStats.by_status?.buckets || []).map((b: any) => [b.key, b.doc_count])),
          by_department: Object.fromEntries((complaintStats.by_department?.buckets || []).map((b: any) => [b.key, b.doc_count])),
          by_category: Object.fromEntries((complaintStats.by_category?.buckets || []).map((b: any) => [b.key, b.doc_count])),
          overdue_count: complaintStats.overdue?.doc_count || 0,
          avg_resolution_days: Math.round((complaintStats.avg_days?.value || 0) * 100) / 100,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching ward:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
