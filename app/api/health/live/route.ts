import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    live: true,
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
  });
}
