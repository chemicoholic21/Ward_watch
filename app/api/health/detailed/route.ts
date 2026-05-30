import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/config/mongodb';
import { COLLECTIONS } from '@/lib/server/config/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    const [serverStatus, dbStats, collStats] = await Promise.all([
      db.admin().serverStatus().catch(() => null),
      db.stats().catch(() => null),
      Promise.all(
        Object.values(COLLECTIONS).map(async name => ({
          name,
          count: await db.collection(name).estimatedDocumentCount().catch(() => 0),
        })),
      ),
    ]);

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      application: {
        name: 'WardWatch API',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime_seconds: process.uptime(),
        memory: process.memoryUsage(),
      },
      mongodb: {
        database: db.databaseName,
        version: serverStatus?.version,
        collections: collStats,
        stats: {
          collections_count: dbStats?.collections,
          objects: dbStats?.objects,
          storage_size: dbStats?.storageSize,
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
