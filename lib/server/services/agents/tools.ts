/**
 * Agent tools — Zod-typed wrappers around the existing data services.
 *
 * Each tool exposes one well-defined capability. The LLM picks tools to
 * call based on the user's prompt; the AI SDK runs them, feeds results
 * back into the model, and the loop continues until the model emits a
 * final text answer.
 *
 * Keep tools focused — fewer wider tools confuse the model; many narrow
 * tools work better. Each tool's `description` is what the model reads
 * when deciding whether to use it, so it doubles as agent documentation.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { esService } from '../elasticsearch/client';
import { ES_INDICES } from '../../config/elasticsearch';
import { ghostOfficeDetector } from '../ghost-office/detector';
import { trustLensAnalyzer } from '../trustlens/analyzer';

// ─────────────────────────────────────────────────────────────────────────────
// Data tools
// ─────────────────────────────────────────────────────────────────────────────

export const queryComplaints = tool({
  description:
    'Find civic complaints filtered by status, department, ward, zone, ' +
    'priority, or overdue flag. Use this to investigate patterns or pull ' +
    'evidence for a specific complaint.',
  inputSchema: z.object({
    status: z.enum(['open', 'pending', 'in_progress', 'resolved', 'closed']).optional(),
    department: z.string().optional().describe('e.g. BBMP, BWSSB, BESCOM, BDA, BMTC'),
    ward_id: z.string().optional().describe('e.g. ward_007'),
    zone: z.enum(['North', 'South', 'East', 'West']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    is_overdue: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  execute: async input => {
    const filter: any = { bool: { filter: [] } };
    for (const k of ['status', 'department', 'ward_id', 'zone', 'priority'] as const) {
      if (input[k]) filter.bool.filter.push({ term: { [k]: input[k] } });
    }
    if (input.is_overdue) filter.bool.filter.push({ term: { is_overdue: true } });
    if (filter.bool.filter.length === 0) filter.bool.filter.push({ match_all: {} });

    const result = await esService.search(ES_INDICES.CIVIC_EVENTS, filter, {
      size: input.limit,
      sort: [{ created_at: 'desc' }] as any,
      _source: [
        'event_id',
        'title',
        'department',
        'ward_name',
        'zone',
        'status',
        'priority',
        'days_open',
        'is_overdue',
        'escalation_count',
        'created_at',
      ],
    });
    return { total: result.total, complaints: result.hits };
  },
});

export const getComplaintStats = tool({
  description:
    'Get aggregate complaint statistics: counts by status / department / ' +
    'priority / zone, total overdue, average resolution time. Use this for ' +
    'overview questions like "how many complaints are open?" or comparisons.',
  inputSchema: z.object({
    department: z.string().optional(),
    zone: z.string().optional(),
    date_from: z.string().optional().describe('ES date math like "now-7d" or ISO date'),
  }),
  execute: async input => {
    const query: any = { bool: { must: [{ match_all: {} }], filter: [] } };
    if (input.department) query.bool.filter.push({ term: { department: input.department } });
    if (input.zone) query.bool.filter.push({ term: { zone: input.zone } });
    if (input.date_from) query.bool.filter.push({ range: { created_at: { gte: input.date_from } } });

    const aggs = {
      by_status: { terms: { field: 'status' } },
      by_department: { terms: { field: 'department', size: 20 } },
      by_priority: { terms: { field: 'priority' } },
      overdue: { filter: { term: { is_overdue: true } } },
      avg_days: { avg: { field: 'days_open' } },
    };
    const result = await esService.aggregate(ES_INDICES.CIVIC_EVENTS, aggs, query);
    const total = await esService.count(ES_INDICES.CIVIC_EVENTS, query);

    return {
      total,
      by_status: Object.fromEntries((result.by_status?.buckets || []).map((b: any) => [b.key, b.doc_count])),
      by_department: Object.fromEntries((result.by_department?.buckets || []).map((b: any) => [b.key, b.doc_count])),
      by_priority: Object.fromEntries((result.by_priority?.buckets || []).map((b: any) => [b.key, b.doc_count])),
      overdue_count: result.overdue?.doc_count || 0,
      avg_days_open: Math.round((result.avg_days?.value || 0) * 100) / 100,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Ghost-office tools
// ─────────────────────────────────────────────────────────────────────────────

export const getTopGhostOffices = tool({
  description:
    'Get the worst-performing ("ghost") government offices ranked by a ' +
    'composite score that weighs stagnation, escalation loops, overdue ' +
    'rate, and transfer ping-pong. Use this for "which offices are ' +
    'worst?" or "investigate the most unresponsive offices".',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(5),
  }),
  execute: async ({ limit }) => {
    const offices = await ghostOfficeDetector.getTopGhostOffices(limit);
    return { offices };
  },
});

export const analyzeGhostOffices = tool({
  description:
    'Scope ghost-office detection to a specific zone or department. ' +
    'Returns scores plus a summary (counts at each alert level).',
  inputSchema: z.object({
    zone: z.string().optional(),
    department: z.string().optional(),
  }),
  execute: async input => {
    const result = await ghostOfficeDetector.calculateGhostScores({
      zone: input.zone,
      department: input.department,
    });
    return { offices: result.offices.slice(0, 20), summary: result.summary };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TrustLens / scam tools
// ─────────────────────────────────────────────────────────────────────────────

export const analyzeMessage = tool({
  description:
    'Run a message through the regex-based scam classifier (fast, no DB). ' +
    'Returns risk_level, scam_type, matched patterns, recommended action. ' +
    'Use this for any "is this scam?" question or to triage a suspicious ' +
    'message a citizen pasted.',
  inputSchema: z.object({
    content: z.string(),
    url: z.string().optional(),
  }),
  execute: async ({ content, url }) => trustLensAnalyzer.analyzeContent(content, url),
});

export const getScamStats = tool({
  description:
    'Get aggregate scam-report statistics: counts by risk level, scam ' +
    'type, and spoofed department. Use this for trend questions.',
  inputSchema: z.object({
    zone: z.string().optional(),
    date_from: z.string().optional(),
  }),
  execute: async input =>
    trustLensAnalyzer.getScamStatistics({
      zone: input.zone,
      dateRange: input.date_from ? { gte: input.date_from } : undefined,
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool sets per agent — each agent gets only the tools it should reason with.
// Keeping the set small per-agent makes tool selection more reliable.
// ─────────────────────────────────────────────────────────────────────────────

export const TOOLS_BY_AGENT = {
  'ghost-hunter': {
    queryComplaints,
    getComplaintStats,
    getTopGhostOffices,
    analyzeGhostOffices,
  },
  'scam-detector': {
    analyzeMessage,
    getScamStats,
  },
  'escalation-tracer': {
    queryComplaints,
    getComplaintStats,
  },
  'civic-analyzer': {
    queryComplaints,
    getComplaintStats,
    getTopGhostOffices,
    analyzeGhostOffices,
    getScamStats,
  },
  'rti-drafter': {
    queryComplaints,
    getTopGhostOffices,
    analyzeGhostOffices,
  },
} as const;

export type AgentName = keyof typeof TOOLS_BY_AGENT;
