import { NextRequest, NextResponse } from 'next/server';
import { esService } from '@/lib/server/services/elasticsearch/client';
import { ES_INDICES } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const bounds = sp.get('bounds');
    const precision = parseInt(sp.get('precision') || '6', 10);

    const aggs = {
      geo_grid: {
        geohash_grid: { field: 'geo_location', precision },
        aggs: {
          centroid: { geo_centroid: { field: 'geo_location' } },
          by_status: { terms: { field: 'status' } },
          overdue: { filter: { term: { is_overdue: true } } },
        },
      },
      zone_centroids: {
        terms: { field: 'zone', size: 10 },
        aggs: {
          centroid: { geo_centroid: { field: 'geo_location' } },
          count: { value_count: { field: 'event_id' } },
        },
      },
    };

    let query: any = { match_all: {} };
    if (bounds) {
      const [topLeft, bottomRight] = bounds.split(',');
      const [topLat, leftLon] = topLeft.split(':').map(Number);
      const [bottomLat, rightLon] = bottomRight.split(':').map(Number);

      query = {
        geo_bounding_box: {
          geo_location: {
            top_left: { lat: topLat, lon: leftLon },
            bottom_right: { lat: bottomLat, lon: rightLon },
          },
        },
      };
    }

    const result = await esService.aggregate(ES_INDICES.CIVIC_EVENTS, aggs, query);

    return NextResponse.json({
      success: true,
      data: {
        clusters: (result.geo_grid?.buckets || []).map((b: any) => ({
          geohash: b.key,
          count: b.doc_count,
          centroid: b.centroid?.location || null,
          overdue_count: b.overdue?.doc_count || 0,
        })),
        zones: (result.zone_centroids?.buckets || []).map((b: any) => ({
          zone: b.key,
          count: b.count?.value || b.doc_count,
          centroid: b.centroid?.location || null,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error fetching geo analytics:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
