import { NextRequest, NextResponse } from 'next/server';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { officeId: string } }) {
  try {
    const office = await ghostOfficeDetector.getGhostOfficeById(params.officeId);
    if (!office) {
      return NextResponse.json({ success: false, error: 'Ghost office not found' }, { status: 404 });
    }

    const [department, wardId] = params.officeId.split('_');
    const complaints = await esService.search(
      ES_INDICES.CIVIC_EVENTS,
      { bool: { filter: [{ term: { department } }, { term: { ward_id: wardId } }] } },
      { size: 20, sort: [{ created_at: 'desc' }] as any },
    );

    return NextResponse.json({
      success: true,
      data: { ...office, recent_complaints: complaints.hits },
    });
  } catch (error: any) {
    console.error('Error fetching ghost office:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
