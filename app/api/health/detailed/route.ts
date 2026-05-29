import { NextResponse } from 'next/server';
import { getElasticsearchClient } from '@/lib/server/config/elasticsearch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const esClient = getElasticsearchClient();
    const [clusterHealth, clusterStats, nodesInfo] = await Promise.all([
      esClient.cluster.health(),
      esClient.cluster.stats(),
      esClient.nodes.info(),
    ]);

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      application: {
        name: 'GhostOffice API',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime_seconds: process.uptime(),
        memory: process.memoryUsage(),
      },
      elasticsearch: {
        health: {
          status: clusterHealth.status,
          cluster_name: clusterHealth.cluster_name,
          number_of_nodes: clusterHealth.number_of_nodes,
          active_primary_shards: clusterHealth.active_primary_shards,
          active_shards: clusterHealth.active_shards,
          relocating_shards: clusterHealth.relocating_shards,
          initializing_shards: clusterHealth.initializing_shards,
          unassigned_shards: clusterHealth.unassigned_shards,
        },
        stats: {
          indices_count: clusterStats.indices?.count || 0,
          docs_count: clusterStats.indices?.docs?.count || 0,
          store_size: clusterStats.indices?.store?.size_in_bytes || 0,
        },
        nodes: Object.keys(nodesInfo.nodes || {}).length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'unhealthy', timestamp: new Date().toISOString(), error: error?.message },
      { status: 503 },
    );
  }
}
