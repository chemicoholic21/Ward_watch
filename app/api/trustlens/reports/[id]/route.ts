import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const report = await esService.get(ES_INDICES.SCAM_REPORTS, params.id);
    if (!report) {
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: report });
  } catch (error: any) {
    console.error('Error fetching report:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
