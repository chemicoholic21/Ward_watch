import { NextRequest, NextResponse } from 'next/server';
import { trustLensAnalyzer } from '@/lib/server/services/trustlens/analyzer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const zone = sp.get('zone') || undefined;
    const date_from = sp.get('date_from');
    const stats = await trustLensAnalyzer.getScamStatistics({
      zone,
      dateRange: date_from ? { gte: date_from } : undefined,
    });
    return NextResponse.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
