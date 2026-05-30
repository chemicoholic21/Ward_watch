# Agents Guide

This app now ships with real LLM-driven agents alongside the original deterministic switch-statement "agents". Both endpoints coexist:

| Endpoint | What it does | Needs API key? |
|---|---|---|
| `POST /api/agents/execute` | Hardcoded dispatch (the original) — fast, predictable, free | No |
| `POST /api/agents/chat` | LLM tool loop — natural language in, narrative answer out | Yes, `GROQ_API_KEY` |

## Stack

| Layer | Choice | Why |
|---|---|---|
| Provider | **[Groq](https://groq.com)** | Free tier (30 RPM, 14.4k RPD), fastest hosted inference, OpenAI-compatible |
| Model | **Llama 3.3 70B Versatile** | Open weights (Meta), strong tool-use, free on Groq |
| Framework | **[Vercel AI SDK v6](https://sdk.vercel.ai/)** | MIT-licensed, designed for Next.js/Vercel, provider-agnostic `tool()` API |
| Schemas | **Zod** | Type-safe tool definitions; the SDK validates LLM-emitted tool inputs against these |

Total cost: **$0/month** on Groq's free tier for personal / demo / small-production use.

## Get started in 90 seconds

1. **Get a Groq API key** (free, no credit card):
   → <https://console.groq.com/keys> → "Create API Key" → copy.

2. **Add to your env:**
   ```bash
   echo "GROQ_API_KEY=gsk_xxxxxxxxxxxxx" >> .env.local
   ```

3. **Restart your dev server:**
   ```bash
   npm run dev
   ```

4. **Talk to an agent:**
   ```bash
   curl -X POST http://localhost:3000/api/agents/chat \
     -H "Content-Type: application/json" \
     -d '{"agent_type":"ghost-hunter","prompt":"Which 3 BBMP offices are worst this month and why?"}'
   ```

   Response shape:
   ```json
   {
     "success": true,
     "data": {
       "agent_type": "ghost-hunter",
       "model": "llama-3.3-70b-versatile",
       "answer": "The three worst BBMP offices this month are...",
       "steps": 3,
       "tools_used": ["getTopGhostOffices", "queryComplaints", "queryComplaints"],
       "tool_trace": [ /* full inputs + outputs for each tool call */ ],
       "usage": { "inputTokens": 1542, "outputTokens": 287, "totalTokens": 1829 }
     }
   }
   ```

## How it works

1. Client POSTs `{ agent_type, prompt }` to `/api/agents/chat`.
2. `runAgent()` in `lib/server/services/agents/llm-runtime.ts` looks up the agent's system prompt + allowed tools.
3. Calls `generateText({ model, tools, system, prompt, stopWhen: stepCountIs(6) })` (Vercel AI SDK).
4. The model picks tools → SDK runs them → results feed back into the model → loop, until the model emits a final text answer or hits the 6-step cap.
5. Each tool is a thin Zod-typed wrapper around the existing MongoDB-backed services (`esService.search/aggregate/...`, `ghostOfficeDetector.*`, `trustLensAnalyzer.*`).

```
POST /api/agents/chat
       │
       ▼
runAgent({ agent: 'ghost-hunter', prompt: '...' })
       │
       ├──── system prompt for 'ghost-hunter'
       ├──── tools: { queryComplaints, getComplaintStats, getTopGhostOffices, analyzeGhostOffices }
       ▼
generateText() ──┐  step 1: model thinks → emits tool_call(getTopGhostOffices, limit=5)
                 │  step 2: SDK runs tool → result fed back
                 │  step 3: model thinks → emits tool_call(queryComplaints, filter)
                 │  step 4: SDK runs tool → result fed back
                 │  step 5: model emits final text answer
                 ▼
{ answer, steps, tools_used, tool_trace, usage }
```

## The 5 agents

| `agent_type` | System prompt summary | Tools available |
|---|---|---|
| `ghost-hunter` | Investigates unresponsive offices; cites concrete figures | queryComplaints, getComplaintStats, getTopGhostOffices, analyzeGhostOffices |
| `scam-detector` | Triages suspicious messages; plain-language advice | analyzeMessage, getScamStats |
| `escalation-tracer` | Explains where complaints get stuck and why | queryComplaints, getComplaintStats |
| `civic-analyzer` | General-purpose civic-health Q&A | All data tools |
| `rti-drafter` | Drafts RTI applications with cited evidence | queryComplaints, getTopGhostOffices, analyzeGhostOffices |

All defined in `lib/server/services/agents/tools.ts` (`TOOLS_BY_AGENT`).

## Adding a new tool

A "tool" is a Zod-validated function the agent can decide to call:

```ts
// in lib/server/services/agents/tools.ts
import { tool } from 'ai';
import { z } from 'zod';

export const getComplaintTimeline = tool({
  description: 'Get the full timeline (status changes, escalations) for one complaint by ID',
  inputSchema: z.object({
    complaint_id: z.string().describe('e.g. CMP-2024-00042'),
  }),
  execute: async ({ complaint_id }) => {
    const c = await esService.get(ES_INDICES.CIVIC_EVENTS, complaint_id);
    return c?.timeline ?? [];
  },
});
```

Then attach it to whichever agents should use it:

```ts
export const TOOLS_BY_AGENT = {
  'escalation-tracer': {
    queryComplaints,
    getComplaintStats,
    getComplaintTimeline,   // ← here
  },
  // ...
};
```

That's it — no other wiring. The model reads the `description` and decides when to call it.

## Adding a new agent

```ts
// 1. lib/server/services/agents/tools.ts — add to TOOLS_BY_AGENT
'fraud-investigator': { queryComplaints, analyzeMessage, getScamStats },

// 2. lib/server/services/agents/llm-runtime.ts — add to SYSTEM_PROMPTS
'fraud-investigator': `You are Fraud Investigator. ...`,
```

That's it — `/api/agents/chat` accepts the new `agent_type` immediately.

## Swapping the LLM provider

The provider lives in `llm-runtime.ts` in exactly one place:

```ts
import { createGroq } from '@ai-sdk/groq';
const provider = createGroq({ apiKey: process.env.GROQ_API_KEY });
```

To switch to (e.g.) Anthropic, OpenAI, Cerebras, Mistral, Ollama:

```bash
npm install @ai-sdk/anthropic
```

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
const provider = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = provider('claude-sonnet-4-5-20250929');
```

Tools, system prompts, and route handlers don't change. The AI SDK normalizes tool-use across providers.

Available providers: <https://sdk.vercel.ai/providers/ai-sdk-providers>

## Cost & rate limits (Groq free tier)

| Model | RPM | RPD | Tokens/min |
|---|---|---|---|
| llama-3.3-70b-versatile | 30 | 14,400 | 6,000 |
| llama-3.1-8b-instant | 30 | 14,400 | 30,000 |
| mixtral-8x7b-32768 | 30 | 14,400 | 5,000 |

Current limits: <https://console.groq.com/docs/rate-limits>

For higher volume: Groq has a paid tier, or swap providers (Cerebras has similar free tier; Anthropic / OpenAI / Bedrock if you have budget).

## Vercel deployment

In your Vercel project → Settings → Environment Variables → add:

| Variable | Value |
|---|---|
| `GROQ_API_KEY` | `gsk_...` from console.groq.com |

That's it. The chat endpoint is a normal Vercel serverless function — `vercel.json` already pins `maxDuration: 30s` which is enough headroom for the 6-step tool loop.

## When NOT to use the LLM endpoint

The original `/api/agents/execute` switch-statement dispatcher is still there and still useful:

- **Programmatic callers** that know exactly what they want — `executeAgentTask("ghost-hunter", "get_top", { limit: 10 })` is faster and free.
- **Frontend dashboards** that just need to render leaderboards / heatmaps.
- **Anything that has to be deterministic.**

Use `/api/agents/chat` for:
- **Natural-language UI** (chat box on the dashboard).
- **Investigative questions** the data layer doesn't directly answer ("which department got worse this month?").
- **Drafting** (RTI / escalation / social posts) where the LLM's writing is the value-add.

Both endpoints can coexist on the same deployment, hitting the same data.
