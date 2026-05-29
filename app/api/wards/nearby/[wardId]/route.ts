import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { wardId: string } }) {
  try {
    const distance = req.nextUrl.searchParams.get('distance') || '5km';

    const sourceWard = await esService.get<any>(ES_INDICES.WARD_METRICS, params.wardId);
    if (!sourceWard) {
      return NextResponse.json({ success: false, error: 'Ward not found' }, { status: 404 });
    }
    if (!sourceWard.centroid) {
      return NextResponse.json({ success: false, error: 'Ward has no location data' }, { status: 400 });
    }

    const query = {
      bool: {
        must: [{ geo_distance: { distance, centroid: sourceWard.centroid } }],
        must_not: [{ term: { ward_id: params.wardId } }],
      },
    };

    const nearbyWards = await esService.search(ES_INDICES.WARD_METRICS, query, { size: 10 });

    return NextResponse.json({
      success: true,
      data: { source: sourceWard, nearby: nearbyWards.hits, search_radius: distance },
    });
  } catch (error: any) {
    console.error('Error fetching nearby wards:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
