import { NextRequest, NextResponse } from 'next/server';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const department = sp.get('department') || undefined;
    const zone = sp.get('zone') || undefined;
    const min_complaints = sp.get('min_complaints');
    const date_from = sp.get('date_from');
    const date_to = sp.get('date_to');
    const limit = parseInt(sp.get('limit') || '50', 10);

    const result = await ghostOfficeDetector.calculateGhostScores({
      department,
      zone,
      minComplaints: min_complaints ? parseInt(min_complaints, 10) : undefined,
      dateRange: date_from ? { gte: date_from, lte: date_to || undefined } : undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        offices: result.offices.slice(0, limit),
        summary: result.summary,
        calculated_at: result.calculated_at,
      },
    });
  } catch (error: any) {
    console.error('Error fetching ghost offices:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
