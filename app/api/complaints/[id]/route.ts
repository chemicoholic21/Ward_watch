import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const complaint = await esService.get(ES_INDICES.CIVIC_EVENTS, params.id);
    if (!complaint) {
      return NextResponse.json({ success: false, error: 'Complaint not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: complaint });
  } catch (error: any) {
    console.error('Error fetching complaint:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const complaint = await esService.get(ES_INDICES.CIVIC_EVENTS, params.id);
    if (!complaint) {
      return NextResponse.json({ success: false, error: 'Complaint not found' }, { status: 404 });
    }

    const { status, priority, assigned_to, notes } = await req.json();
    const updates: any = { updated_at: new Date().toISOString() };
    const timelineEntry: any = { timestamp: new Date().toISOString(), actor: 'api' };

    if (status) {
      updates.status = status;
      timelineEntry.action = 'status_changed';
      timelineEntry.description = `Status changed to ${status}`;
    }
    if (priority) updates.priority = priority;
    if (assigned_to) updates.assigned_to = assigned_to;
    if (notes) timelineEntry.notes = notes;

    await esService.update(ES_INDICES.CIVIC_EVENTS, params.id, updates);

    return NextResponse.json({ success: true, data: { id: params.id, ...updates } });
  } catch (error: any) {
    console.error('Error updating complaint:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
