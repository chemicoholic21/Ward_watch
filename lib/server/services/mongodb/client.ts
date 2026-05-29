/**
 * MongoService — drop-in replacement for the legacy ElasticsearchService.
 *
 * Exposes the exact same method surface (search/get/index/bulkIndex/update/
 * delete/count/aggregate/vectorSearch) so the 41 App Router route handlers
 * don't need to know whether the backing store is ES or Mongo.
 *
 * Index name strings the route handlers pass (`civic-events`, etc.) are
 * mapped to Mongo collection names automatically via resolveCollection().
 */

import type { Collection, Sort } from 'mongodb';
import { getDb, resolveCollection } from '../../config/mongodb';
import { translateQuery } from './query-translator';
import { runAggregations } from './agg-evaluator';

async function col(index: string): Promise<Collection> {
  const db = await getDb();
  return db.collection(resolveCollection(index));
}

/** Turn an ES `sort` clause into a Mongo Sort object. */
function translateSort(esSort: any): Sort | undefined {
  if (!esSort) return undefined;
  if (typeof esSort === 'string') return { [esSort]: 1 };
  if (Array.isArray(esSort)) {
    const out: Record<string, 1 | -1> = {};
    for (const entry of esSort) {
      if (typeof entry === 'string') out[entry] = 1;
      else if (entry && typeof entry === 'object') {
        for (const [k, v] of Object.entries(entry)) {
          const dir = typeof v === 'string' ? v : (v as any)?.order;
          out[k.replace(/\.keyword$/, '')] = dir === 'desc' ? -1 : 1;
        }
      }
    }
    return out;
  }
  return undefined;
}

/** Turn an ES `_source` projection into a Mongo projection. */
function translateProjection(_source: any): Record<string, 1 | 0> | undefined {
  if (_source === false) return { _id: 1 };
  if (Array.isArray(_source)) {
    const out: Record<string, 1 | 0> = {};
    for (const f of _source) out[f] = 1;
    return out;
  }
  return undefined;
}

/**
 * Some routes write `geo_location: { lat, lon }` and others read it. We mirror
 * that into a sibling `geo_location._geo: { type: 'Point', coordinates: [lon, lat] }`
 * so the 2dsphere index works for $geoWithin queries.
 */
function enrichGeo(doc: any): any {
  if (!doc || typeof doc !== 'object') return doc;
  const g = doc.geo_location;
  if (g && typeof g === 'object' && 'lat' in g && 'lon' in g) {
    doc.geo_location = {
      ...g,
      _geo: { type: 'Point', coordinates: [g.lon, g.lat] },
    };
  }
  const c = doc.centroid;
  if (c && typeof c === 'object' && 'lat' in c && 'lon' in c) {
    doc.centroid = {
      ...c,
      _geo: { type: 'Point', coordinates: [c.lon, c.lat] },
    };
  }
  return doc;
}

/** Strip Mongo `_id` away from the projected document body. */
function applySource<T>(raw: any): T {
  if (!raw) return raw as T;
  const { _id, ...rest } = raw;
  return { _id, ...rest } as T;
}

export class MongoService {
  async search<T>(
    index: string,
    query: any,
    options?: {
      size?: number;
      from?: number;
      sort?: any;
      aggs?: Record<string, any>;
      _source?: string[] | boolean;
    },
  ): Promise<{ hits: T[]; total: number; aggregations?: Record<string, any> }> {
    const c = await col(index);
    const filter = translateQuery(query);

    const cursor = c
      .find(filter, {
        projection: translateProjection(options?._source),
        sort: translateSort(options?.sort),
        skip: options?.from ?? 0,
        limit: options?.size ?? 20,
      });

    const [hits, total] = await Promise.all([cursor.toArray(), c.countDocuments(filter)]);

    let aggregations: Record<string, any> | undefined;
    if (options?.aggs && Object.keys(options.aggs).length) {
      aggregations = await runAggregations(c, options.aggs, filter);
    }

    return { hits: hits.map((h: any) => applySource<T>(h)), total, aggregations };
  }

  async get<T>(index: string, id: string): Promise<T | null> {
    const c = await col(index);
    const doc = await c.findOne({ _id: id as any });
    if (!doc) return null;
    return applySource<T>(doc);
  }

  async index<T>(
    index: string,
    document: T,
    options?: { id?: string; pipeline?: string; refresh?: boolean },
  ): Promise<string> {
    const c = await col(index);
    const id = options?.id ?? (document as any)?.event_id ?? (document as any)?.report_id ?? newId();
    const body = enrichGeo({ ...(document as any), _id: id });
    await c.replaceOne({ _id: id as any }, body, { upsert: true });
    return id;
  }

  async bulkIndex<T>(
    index: string,
    documents: T[],
    options?: { pipeline?: string; idField?: string },
  ): Promise<{ successful: number; failed: number }> {
    if (!documents.length) return { successful: 0, failed: 0 };
    const c = await col(index);
    const ops = documents.map(doc => {
      const id =
        (options?.idField && (doc as any)[options.idField]) ||
        (doc as any)?.event_id ||
        (doc as any)?.report_id ||
        (doc as any)?.office_id ||
        (doc as any)?.ward_id ||
        newId();
      const body = enrichGeo({ ...(doc as any), _id: id });
      return { replaceOne: { filter: { _id: id }, replacement: body, upsert: true } } as any;
    });

    try {
      const res = await c.bulkWrite(ops, { ordered: false });
      const successful = (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0);
      return { successful, failed: documents.length - successful };
    } catch (e: any) {
      console.error('bulkIndex error:', e?.message);
      return { successful: 0, failed: documents.length };
    }
  }

  async update<T>(index: string, id: string, doc: Partial<T>): Promise<void> {
    const c = await col(index);
    await c.updateOne({ _id: id as any }, { $set: enrichGeo({ ...doc }) });
  }

  async delete(index: string, id: string): Promise<boolean> {
    const c = await col(index);
    const r = await c.deleteOne({ _id: id as any });
    return r.deletedCount > 0;
  }

  async count(index: string, query?: any): Promise<number> {
    const c = await col(index);
    return c.countDocuments(translateQuery(query));
  }

  async aggregate(
    index: string,
    aggs: Record<string, any>,
    query?: any,
  ): Promise<Record<string, any>> {
    const c = await col(index);
    const baseFilter = translateQuery(query);
    return runAggregations(c, aggs, baseFilter);
  }

  /**
   * Vector kNN search. Atlas Vector Search would be the right tool but isn't
   * available on M0. We do a brute-force cosine similarity in JS — fine for
   * the demo dataset (a few thousand vectors). For production scale, swap to
   * Atlas Search M10+ or to MongoDB 7's `$vectorSearch` operator.
   */
  async vectorSearch<T>(
    index: string,
    field: string,
    vector: number[],
    options?: { k?: number; numCandidates?: number; filter?: any; _source?: string[] },
  ): Promise<T[]> {
    const c = await col(index);
    const filter = options?.filter ? translateQuery(options.filter) : {};
    const docs = await c
      .find(filter, { projection: translateProjection(options?._source) })
      .limit(options?.numCandidates ?? 1000)
      .toArray();

    const scored = docs
      .map((d: any) => {
        const v = d[field];
        if (!Array.isArray(v)) return null;
        return { doc: d, score: cosineSimilarity(v, vector) };
      })
      .filter(Boolean) as Array<{ doc: any; score: number }>;

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, options?.k ?? 10).map(s => applySource<T>({ ...s.doc, _score: s.score }));
  }

  /** Cluster health (mirrors `esClient.cluster.health()` shape used by /api/health). */
  async health(): Promise<{ status: string; database: string }> {
    const db = await getDb();
    await db.admin().command({ ping: 1 });
    return { status: 'green', database: db.databaseName };
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function newId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export const mongoService = new MongoService();
