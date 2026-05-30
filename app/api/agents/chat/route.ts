import { NextRequest, NextResponse } from 'next/server';
import { runAgent, isLLMConfigured, AGENT_MODEL } from '@/lib/server/services/agents/llm-runtime';
import { TOOLS_BY_AGENT, type AgentName } from '@/lib/server/services/agents/tools';

export const dynamic = 'force-dynamic';
// LLM tool loops + Mongo aggregations can take a few seconds.
// Vercel hobby allows up to 60s; the vercel.json caps function maxDuration
// at 30s — that's the practical ceiling here.
export const maxDuration = 30;

/**
 * Natural-language entry point for the agents. Example:
 *
 *   POST /api/agents/chat
 *   { "agent_type": "ghost-hunter",
 *     "prompt": "Which 3 offices in South zone are worst this month? Why?" }
 *
 * The agent decides which tools to call, runs them, and synthesizes a
 * narrative answer. Returns the answer plus a trace of which tools fired
 * (useful for the UI to show "I checked X, Y, Z" pills).
 */
export async function POST(req: NextRequest) {
  try {
    const { agent_type, prompt, max_steps } = await req.json();

    if (!agent_type || !prompt) {
      return NextResponse.json(
        { success: false, error: 'agent_type and prompt are required' },
        { status: 400 },
      );
    }

    if (!(agent_type in TOOLS_BY_AGENT)) {
      const valid = Object.keys(TOOLS_BY_AGENT).join(', ');
      return NextResponse.json(
        { success: false, error: `Unknown agent_type. Valid: ${valid}` },
        { status: 400 },
      );
    }

    if (!isLLMConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No LLM provider configured. Set GROQ_API_KEY in your env (free key at https://console.groq.com/keys).',
        },
        { status: 503 },
      );
    }

    const result = await runAgent({
      agent: agent_type as AgentName,
      prompt,
      maxSteps: typeof max_steps === 'number' ? max_steps : undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        agent_type,
        model: AGENT_MODEL,
        answer: result.answer,
        steps: result.steps,
        tools_used: result.toolCalls.map(t => t.tool),
        tool_trace: result.toolCalls,
        usage: result.usage,
      },
    });
  } catch (error: any) {
    console.error('Agent chat error:', error);
    return NextResponse.json({ success: false, error: error?.message ?? 'unknown error' }, { status: 500 });
  }
}
