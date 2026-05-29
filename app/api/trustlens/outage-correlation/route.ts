import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const hours = req.nextUrl.searchParams.get('hours') || '24';

    const outages = await esService.search(
      ES_INDICES.CIVIC_EVENTS,
      {
        bool: {
          must: [
            { term: { event_type: 'outage' } },
            { range: { created_at: { gte: `now-${hours}h` } } },
          ],
        },
      },
      { size: 50 },
    );

    const correlatedScams = await esService.search(
      ES_INDICES.SCAM_REPORTS,
      {
        bool: {
          must: [
            { term: { 'related_outage.is_correlated': true } },
            { range: { reported_at: { gte: `now-${hours}h` } } },
          ],
        },
      },
      { size: 100 },
    );

    const correlationByDept: Record<string, { outages: number; scams: number; spike_detected: boolean }> = {};

    for (const outage of outages.hits) {
      const dept = (outage as any).department;
      if (!correlationByDept[dept]) correlationByDept[dept] = { outages: 0, scams: 0, spike_detected: false };
      correlationByDept[dept].outages++;
    }

    for (const scam of correlatedScams.hits) {
      const dept = (scam as any).spoofed_department;
      if (dept && correlationByDept[dept]) {
        correlationByDept[dept].scams++;
        if (correlationByDept[dept].scams > correlationByDept[dept].outages * 2) {
          correlationByDept[dept].spike_detected = true;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        time_window_hours: parseInt(hours, 10),
        total_outages: outages.total,
        total_correlated_scams: correlatedScams.total,
        by_department: correlationByDept,
        alert: Object.values(correlationByDept).some(d => d.spike_detected) ? 'SCAM_SPIKE_DETECTED' : 'NORMAL',
      },
    });
  } catch (error: any) {
    console.error('Error fetching correlation:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
