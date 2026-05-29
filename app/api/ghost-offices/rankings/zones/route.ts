import { NextResponse } from 'next/server';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await ghostOfficeDetector.calculateGhostScores();

    const zoneStats = new Map<string, { offices: number; total_score: number; critical: number; high: number }>();

    for (const office of result.offices) {
      if (!zoneStats.has(office.zone)) {
        zoneStats.set(office.zone, { offices: 0, total_score: 0, critical: 0, high: 0 });
      }
      const zone = zoneStats.get(office.zone)!;
      zone.offices++;
      zone.total_score += office.ghost_score;
      if (office.alert_level === 'critical') zone.critical++;
      if (office.alert_level === 'high') zone.high++;
    }

    const rankings = Array.from(zoneStats.entries())
      .map(([zone, stats]) => ({
        zone,
        offices: stats.offices,
        avg_ghost_score: Math.round((stats.total_score / stats.offices) * 100) / 100,
        critical_count: stats.critical,
        high_count: stats.high,
      }))
      .sort((a, b) => b.avg_ghost_score - a.avg_ghost_score)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    return NextResponse.json({ success: true, data: rankings });
  } catch (error: any) {
    console.error('Error fetching zone rankings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
