import { NextResponse } from 'next/server';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const heatmapData = await ghostOfficeDetector.getGhostOfficeHeatmap();
    return NextResponse.json({ success: true, data: heatmapData });
  } catch (error: any) {
    console.error('Error fetching heatmap:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
