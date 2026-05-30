import { NextResponse } from 'next/server';
import { mongoService } from '@/lib/server/services/mongodb/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await mongoService.health();
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: { status: 'healthy', uptime: process.uptime() },
        mongodb: { status: db.status, database: db.database },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'unhealthy', timestamp: new Date().toISOString(), error: error?.message },
      { status: 503 },
    );
  }
}
