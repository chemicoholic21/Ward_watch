import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const report = await esService.get<any>(ES_INDICES.SCAM_REPORTS, params.id);
    if (!report) {
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }
    const newCount = (report.victim_reports || 0) + 1;
    await esService.update(ES_INDICES.SCAM_REPORTS, params.id, {
      victim_reports: newCount,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, data: { victim_reports: newCount } });
  } catch (error: any) {
    console.error('Error updating victim count:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
