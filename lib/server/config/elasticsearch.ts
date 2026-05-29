/**
 * Back-compat shim — route handlers still import `ES_INDICES` and
 * `ES_PIPELINES` from this path. Re-export the Mongo collection/pipeline
 * constants under those names so the handlers can keep using
 * `ES_INDICES.CIVIC_EVENTS` (= 'civic_events') unchanged.
 *
 * `getElasticsearchClient()` is preserved as a no-op-ish shim too because the
 * old health route called it directly; the new health route uses
 * mongoService.health() instead.
 */
import { COLLECTIONS, PIPELINES } from './mongodb';

export const ES_INDICES = {
  CIVIC_EVENTS: COLLECTIONS.CIVIC_EVENTS,
  GHOST_OFFICES: COLLECTIONS.GHOST_OFFICES,
  SCAM_REPORTS: COLLECTIONS.SCAM_REPORTS,
  ESCALATION_TRACES: COLLECTIONS.ESCALATION_TRACES,
  WARD_METRICS: COLLECTIONS.WARD_METRICS,
  CIVIC_VECTORS: COLLECTIONS.CIVIC_VECTORS,
} as const;

export const ES_PIPELINES = PIPELINES;

export type ESIndex = (typeof ES_INDICES)[keyof typeof ES_INDICES];
export type ESPipeline = (typeof ES_PIPELINES)[keyof typeof ES_PIPELINES];

/**
 * Deprecated — kept for legacy callers. Throws if called because the ES
 * client is gone. Use `getDb()` from `lib/server/config/mongodb` instead.
 */
export function getElasticsearchClient(): never {
  throw new Error(
    'getElasticsearchClient() is gone — the data layer is MongoDB now. ' +
      'Use `import { getDb } from "@/lib/server/config/mongodb"` instead.',
  );
}
