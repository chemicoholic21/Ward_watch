import { NextRequest, NextResponse } from 'next/server';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10', 10);
    const offices = await ghostOfficeDetector.getTopGhostOffices(limit);
    return NextResponse.json({ success: true, data: offices });
  } catch (error: any) {
    console.error('Error fetching top ghost offices:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
