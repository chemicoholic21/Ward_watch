import { NextResponse } from 'next/server';
import { getElasticsearchClient } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const esHealth = await getElasticsearchClient().cluster.health();
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: { status: 'healthy', uptime: process.uptime() },
        elasticsearch: {
          status: esHealth.status,
          cluster_name: esHealth.cluster_name,
          number_of_nodes: esHealth.number_of_nodes,
          active_shards: esHealth.active_shards,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'unhealthy', timestamp: new Date().toISOString(), error: error?.message },
      { status: 503 },
    );
  }
}
