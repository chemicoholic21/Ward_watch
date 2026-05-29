import { NextRequest, NextResponse } from 'next/server';
import {
  AGENT_TYPES,
  executeGhostHunter,
  executeScamDetector,
  executeEscalationTracer,
  executeCivicAnalyzer,
  executeRtiDrafter,
} from '@/lib/server/services/agents/helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { agent_type, task, parameters = {} } = await req.json();

    if (!agent_type || !task) {
      return NextResponse.json({ success: false, error: 'agent_type and task are required' }, { status: 400 });
    }

    const executionId = `EXEC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let result: any;

    switch (agent_type) {
      case AGENT_TYPES.GHOST_HUNTER:
        result = await executeGhostHunter(task, parameters);
        break;
      case AGENT_TYPES.SCAM_DETECTOR:
        result = await executeScamDetector(task, parameters);
        break;
      case AGENT_TYPES.ESCALATION_TRACER:
        result = await executeEscalationTracer(task, parameters);
        break;
      case AGENT_TYPES.CIVIC_ANALYZER:
        result = await executeCivicAnalyzer(task, parameters);
        break;
      case AGENT_TYPES.RTI_DRAFTER:
        result = await executeRtiDrafter(task, parameters);
        break;
      default:
        return NextResponse.json({ success: false, error: `Unknown agent type: ${agent_type}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        execution_id: executionId,
        agent_type,
        task,
        result,
        executed_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error executing agent:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
