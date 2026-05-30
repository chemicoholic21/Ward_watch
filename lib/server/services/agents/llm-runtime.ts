/**
 * LLM runtime — provider configuration + per-agent system prompts + the
 * generic "run an agent" wrapper that ties the model, tools, and stop
 * condition together.
 *
 * Provider: Groq (free tier, OpenAI-compatible API, Meta Llama 3.3 70B —
 *           open weights, ~500 tok/s on Groq's LPU hardware).
 *
 * Swap provider: change `provider` and `MODEL_ID` below. Everything else
 * — tools, prompts, route handler — is provider-agnostic.
 */

import { createGroq } from '@ai-sdk/groq';
import { generateText, stepCountIs } from 'ai';
import { TOOLS_BY_AGENT, type AgentName } from './tools';

const MODEL_ID = process.env.AGENT_MODEL_ID || 'llama-3.3-70b-versatile';

// Lazy provider — only constructed when an agent actually runs, so the
// app boots fine without GROQ_API_KEY set.
let _groq: ReturnType<typeof createGroq> | null = null;
function getProvider() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys ' +
          'and add it to your .env.local or your Vercel project env vars.',
      );
    }
    _groq = createGroq({ apiKey });
  }
  return _groq;
}

/**
 * Per-agent system prompts. The agent's "personality" + scope + how it
 * should reason. Kept short — the model figures the rest out from tool
 * descriptions.
 */
const SYSTEM_PROMPTS: Record<AgentName, string> = {
  'ghost-hunter': `You are Ghost Hunter, an agent that investigates unresponsive Bengaluru municipal offices ("ghost offices") using complaint data from BBMP, BWSSB, BESCOM, BDA, and BMTC.

When asked about specific offices, zones, or departments, USE THE TOOLS to pull real numbers — don't guess. Prefer getTopGhostOffices for "which are worst" questions, analyzeGhostOffices for zone/department drilldowns, and queryComplaints + getComplaintStats for evidence.

Always cite concrete figures (ghost score, overdue %, days open) in your answer. End with one actionable recommendation a citizen could take (file RTI, escalate, complain on social media).`,

  'scam-detector': `You are TrustLens, a scam-detection agent for Bengaluru citizens. Government department impersonation (fake BESCOM/BBMP/BWSSB notices, fake bill payments, OTP theft) is the main threat.

For any message a user shares, USE analyzeMessage to get a structured risk assessment. Translate the technical output into plain advice the citizen can act on immediately. If the risk is high/critical, lead with "STOP — this is likely a scam" and tell them exactly what NOT to do.`,

  'escalation-tracer': `You are Escalation Tracer, an agent that follows complaint paths through the municipal system. Pull data with the tools and explain WHERE complaints get stuck and WHY — focus on bottleneck departments, transfer ping-pong, and stagnation patterns.`,

  'civic-analyzer': `You are Civic Analyzer, a general-purpose agent for civic health questions. You have access to complaint data, ghost-office scores, and scam statistics. Use whichever tools fit the question. Be concise and quantitative.`,

  'rti-drafter': `You are RTI Drafter, an agent that helps citizens draft Right To Information applications under the RTI Act 2005. Pull the relevant complaint or ghost-office data using the tools, then draft a properly formatted RTI application referencing specific evidence (complaint IDs, days pending, escalation counts). Keep the language polite and formal.`,
};

export type AgentResult = {
  answer: string;
  steps: number;
  toolCalls: Array<{ tool: string; input: unknown; output: unknown }>;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

/**
 * Run an agent on a user prompt. Synchronous — returns the final answer
 * after the model has finished its tool loop (or hit MAX_STEPS).
 */
export async function runAgent(opts: {
  agent: AgentName;
  prompt: string;
  maxSteps?: number;
}): Promise<AgentResult> {
  const tools = TOOLS_BY_AGENT[opts.agent];
  if (!tools) throw new Error(`Unknown agent: ${opts.agent}`);

  const result = await generateText({
    model: getProvider()(MODEL_ID),
    tools: tools as any,
    system: SYSTEM_PROMPTS[opts.agent],
    prompt: opts.prompt,
    // Cap how many model rounds (think → tool → think → tool → ...) the
    // agent gets before being forced to answer. Bigger = more reasoning,
    // longer latency and higher token cost. 6 is enough for most queries.
    stopWhen: stepCountIs(opts.maxSteps ?? 6),
  });

  const toolCalls: AgentResult['toolCalls'] = [];
  for (const step of result.steps) {
    for (const call of step.toolCalls ?? []) {
      const matchingResult = (step.toolResults ?? []).find((r: any) => r.toolCallId === call.toolCallId);
      toolCalls.push({
        tool: call.toolName,
        input: (call as any).input ?? (call as any).args,
        output: (matchingResult as any)?.output ?? (matchingResult as any)?.result,
      });
    }
  }

  return {
    answer: result.text,
    steps: result.steps.length,
    toolCalls,
    usage: {
      inputTokens: (result.usage as any)?.inputTokens ?? (result.usage as any)?.promptTokens,
      outputTokens: (result.usage as any)?.outputTokens ?? (result.usage as any)?.completionTokens,
      totalTokens: (result.usage as any)?.totalTokens,
    },
  };
}

/** Sanity check that an LLM provider is configured. Used by the chat route. */
export function isLLMConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export const AGENT_MODEL = MODEL_ID;
