import { NextResponse } from 'next/server';
import { AGENT_LIST } from '@/lib/server/services/agents/helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      orchestrator: 'OpenClaw',
      version: '1.0.0',
      active_agents: AGENT_LIST.length,
      health: 'healthy',
      uptime_seconds: process.uptime(),
    },
  });
}
