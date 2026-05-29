import { NextResponse } from 'next/server';
import { ghostOfficeDetector } from '@/lib/server/services/ghost-office/detector';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await ghostOfficeDetector.calculateGhostScores();

    const deptStats = new Map<string, { offices: number; total_score: number; critical: number; high: number }>();

    for (const office of result.offices) {
      if (!deptStats.has(office.department)) {
        deptStats.set(office.department, { offices: 0, total_score: 0, critical: 0, high: 0 });
      }
      const dept = deptStats.get(office.department)!;
      dept.offices++;
      dept.total_score += office.ghost_score;
      if (office.alert_level === 'critical') dept.critical++;
      if (office.alert_level === 'high') dept.high++;
    }

    const rankings = Array.from(deptStats.entries())
      .map(([department, stats]) => ({
        department,
        offices: stats.offices,
        avg_ghost_score: Math.round((stats.total_score / stats.offices) * 100) / 100,
        critical_count: stats.critical,
        high_count: stats.high,
      }))
      .sort((a, b) => b.avg_ghost_score - a.avg_ghost_score)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    return NextResponse.json({ success: true, data: rankings });
  } catch (error: any) {
    console.error('Error fetching department rankings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
