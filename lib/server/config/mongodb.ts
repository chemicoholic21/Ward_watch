import { MongoClient, type Db } from 'mongodb';
import { config } from './environment';

/**
 * Cached connection. In Next.js dev mode hot-reload re-imports modules, which
 * would otherwise open a new pool every save. Hang the cached client off
 * globalThis so HMR survives.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mongoClient: Promise<MongoClient> | undefined;
}

function getMongoUri(): string {
  return process.env.MONGO_URI || 'mongodb://localhost:27017';
}

function getMongoDbName(): string {
  return process.env.MONGO_DB || 'wardwatch';
}

export function getMongoClient(): Promise<MongoClient> {
  if (!global.__mongoClient) {
    const uri = getMongoUri();
    const client = new MongoClient(uri, {
      // Keep the pool small — Vercel functions are short-lived and we don't
      // want to exhaust Atlas's M0 connection limit (500 across the cluster).
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
    });
    global.__mongoClient = client.connect();
  }
  return global.__mongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getMongoDbName());
}

/**
 * Collection name constants. These mirror the legacy ES index names so the
 * back-compat shim in lib/server/config/elasticsearch.ts can re-export them
 * as ES_INDICES without route handlers having to care.
 */
export const COLLECTIONS = {
  CIVIC_EVENTS: 'civic_events',
  GHOST_OFFICES: 'ghost_offices',
  SCAM_REPORTS: 'scam_reports',
  ESCALATION_TRACES: 'escalation_traces',
  WARD_METRICS: 'ward_metrics',
  CIVIC_VECTORS: 'civic_vectors',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

// Legacy ES "pipeline" identifiers — kept so route handlers that pass
// `pipeline: ES_PIPELINES.X` don't blow up. They're no-ops in Mongo.
export const PIPELINES = {
  CIVIC_EVENT: 'civic-event-pipeline',
  SCAM_DETECTION: 'scam-detection-pipeline',
  GEO_ENRICHMENT: 'geo-enrichment-pipeline',
} as const;

// Map legacy ES index name → Mongo collection name. Route handlers still pass
// `ES_INDICES.CIVIC_EVENTS` which evaluates to `'civic-events'` (legacy form);
// the MongoService resolves that to the matching `COLLECTIONS.*` value.
export const LEGACY_INDEX_TO_COLLECTION: Record<string, string> = {
  'civic-events': COLLECTIONS.CIVIC_EVENTS,
  'ghost-offices': COLLECTIONS.GHOST_OFFICES,
  'scam-reports': COLLECTIONS.SCAM_REPORTS,
  'escalation-traces': COLLECTIONS.ESCALATION_TRACES,
  'ward-metrics': COLLECTIONS.WARD_METRICS,
  'civic-vectors': COLLECTIONS.CIVIC_VECTORS,
};

export function resolveCollection(indexOrCollection: string): string {
  return LEGACY_INDEX_TO_COLLECTION[indexOrCollection] || indexOrCollection;
}
