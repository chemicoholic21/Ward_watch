import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { status, verified_by, notes } = await req.json();
    if (!['verified_scam', 'verified_safe', 'pending', 'under_review'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status. Must be: verified_scam, verified_safe, pending, or under_review' },
        { status: 400 },
      );
    }
    const verified_at = new Date().toISOString();
    await esService.update(ES_INDICES.SCAM_REPORTS, params.id, {
      verified_status: status,
      verified_by,
      verification_notes: notes,
      verified_at,
    });
    return NextResponse.json({ success: true, data: { status, verified_at } });
  } catch (error: any) {
    console.error('Error verifying report:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
