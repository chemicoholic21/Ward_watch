import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES, ES_PIPELINES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

// GET /api/complaints — list with filters + pagination
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get('status');
    const department = sp.get('department');
    const ward_id = sp.get('ward_id');
    const zone = sp.get('zone');
    const priority = sp.get('priority');
    const is_overdue = sp.get('is_overdue');
    const date_from = sp.get('date_from');
    const date_to = sp.get('date_to');
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '20', 10);
    const sort_by = sp.get('sort_by') || 'created_at';
    const sort_order = sp.get('sort_order') || 'desc';

    const query: any = { bool: { must: [], filter: [] } };

    if (status) query.bool.filter.push({ term: { status } });
    if (department) query.bool.filter.push({ term: { department } });
    if (ward_id) query.bool.filter.push({ term: { ward_id } });
    if (zone) query.bool.filter.push({ term: { zone } });
    if (priority) query.bool.filter.push({ term: { priority } });
    if (is_overdue === 'true') query.bool.filter.push({ term: { is_overdue: true } });

    if (date_from || date_to) {
      query.bool.filter.push({
        range: {
          created_at: {
            ...(date_from && { gte: date_from }),
            ...(date_to && { lte: date_to }),
          },
        },
      });
    }

    if (query.bool.must.length === 0 && query.bool.filter.length === 0) {
      query.bool.must.push({ match_all: {} });
    }

    const result = await esService.search(ES_INDICES.CIVIC_EVENTS, query, {
      size: limit,
      from: (page - 1) * limit,
      sort: [{ [sort_by]: sort_order }] as any,
    });

    return NextResponse.json({
      success: true,
      data: result.hits,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching complaints:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/complaints — create
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, department, ward_id, category, source, citizen_id, geo_location, address, attachments } = body;

    if (!title || !description || !department || !ward_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: title, description, department, ward_id' },
        { status: 400 },
      );
    }

    const complaint = {
      event_id: `CMP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      event_type: 'complaint',
      title,
      description,
      department,
      ward_id,
      category: category || 'general',
      source: source || 'api',
      citizen_id: citizen_id || `CIT_${Math.random().toString(36).substr(2, 9)}`,
      status: 'open',
      priority: 'medium',
      geo_location,
      address,
      attachments: attachments || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      days_open: 0,
      is_overdue: false,
      escalation_count: 0,
      transfer_count: 0,
      timeline: [
        {
          timestamp: new Date().toISOString(),
          action: 'created',
          description: 'Complaint registered',
          actor: 'system',
        },
      ],
    };

    const id = await esService.index(ES_INDICES.CIVIC_EVENTS, complaint, {
      id: complaint.event_id,
      pipeline: ES_PIPELINES.CIVIC_EVENT,
    });

    return NextResponse.json({ success: true, data: { ...complaint, _id: id } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating complaint:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
