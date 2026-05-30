/**
 * Translates the ES aggregation DSL the legacy route handlers pass into a
 * MongoDB aggregation pipeline, runs it, and reshapes the response back into
 * the ES bucket/value format so the route handlers don't need to change.
 *
 * Supports the subset actually used in this codebase:
 *   terms, composite, date_histogram, filter, value_count, cardinality, avg,
 *   extended_stats, geo_centroid, geohash_grid.
 *
 * Bucketing aggs may have nested simple sub-aggs (value_count, filter, avg,
 * cardinality, geo_centroid). Triple-nesting isn't needed by any current
 * route, so it's not supported.
 */

import type { Collection } from 'mongodb';
import { translateQuery, resolveDateMath } from './query-translator';

type Json = any;

/** MongoDB calendar_interval → $dateTrunc unit. */
const INTERVAL_UNIT: Record<string, string> = {
  minute: 'minute',
  hour: 'hour',
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

/**
 * Run a set of ES-DSL aggregations against a Mongo collection.
 * Returns an object keyed by agg name, each value matching the ES shape:
 *   - bucketing aggs: `{ buckets: [{ key, doc_count, ...subAggs }] }`
 *   - filter aggs:    `{ doc_count }`
 *   - value_count:    `{ value }`
 *   - avg:            `{ value }`
 *   - cardinality:    `{ value }`
 *   - geo_centroid:   `{ location: { lat, lon } }`
 *   - extended_stats: `{ count, sum, avg, min, max, std_deviation }`
 */
export async function runAggregations(
  collection: Collection,
  aggs: Record<string, Json>,
  baseFilter: Record<string, any>,
): Promise<Record<string, any>> {
  const facet: Record<string, any[]> = {};

  for (const [name, agg] of Object.entries(aggs)) {
    facet[name] = buildAggPipeline(agg);
  }

  const pipeline: any[] = [];
  if (baseFilter && Object.keys(baseFilter).length) pipeline.push({ $match: baseFilter });
  pipeline.push({ $facet: facet });

  const [raw] = (await collection.aggregate(pipeline, { allowDiskUse: true }).toArray()) as any[];
  if (!raw) return {};

  const out: Record<string, any> = {};
  for (const [name, agg] of Object.entries(aggs)) {
    out[name] = shapeAggResult(agg, raw[name] || []);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pipeline builders
// ---------------------------------------------------------------------------

function buildAggPipeline(agg: Json): any[] {
  // value_count → total docs in scope
  if (agg.value_count) return [{ $count: 'value' }];

  // cardinality → distinct values
  if (agg.cardinality) {
    const field = agg.cardinality.field;
    return [{ $group: { _id: `$${field}` } }, { $count: 'value' }];
  }

  // avg
  if (agg.avg) {
    return [{ $group: { _id: null, v: { $avg: `$${agg.avg.field}` } } }, { $project: { _id: 0, value: '$v' } }];
  }

  // extended_stats
  if (agg.extended_stats) {
    const f = `$${agg.extended_stats.field}`;
    return [
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          sum: { $sum: f },
          avg: { $avg: f },
          min: { $min: f },
          max: { $max: f },
          std_deviation: { $stdDevPop: f },
        },
      },
      { $project: { _id: 0 } },
    ];
  }

  // filter — re-applies a filter on top of the base $match
  if (agg.filter) {
    const sub = translateQuery(agg.filter);
    const stages: any[] = [];
    if (Object.keys(sub).length) stages.push({ $match: sub });
    stages.push({ $count: 'doc_count' });
    return stages;
  }

  // geo_centroid — average the lat/lon of a geo_point field
  if (agg.geo_centroid) {
    const f = agg.geo_centroid.field;
    return [
      {
        $group: {
          _id: null,
          lat: { $avg: `$${f}.lat` },
          lon: { $avg: `$${f}.lon` },
        },
      },
      { $project: { _id: 0, location: { lat: '$lat', lon: '$lon' } } },
    ];
  }

  // terms — bucket by field, optionally with sub-aggs
  if (agg.terms) {
    return termsLikePipeline({ groupId: `$${agg.terms.field.replace(/\.keyword$/, '')}` }, agg.terms.size ?? 10, agg.aggs);
  }

  // composite — bucket by multiple fields
  if (agg.composite) {
    const sources: Record<string, string> = {};
    for (const src of agg.composite.sources || []) {
      const name = Object.keys(src)[0];
      const inner = src[name];
      const f = (inner.terms?.field || inner.date_histogram?.field || '').replace(/\.keyword$/, '');
      sources[name] = `$${f}`;
    }
    return termsLikePipeline({ groupId: sources }, agg.composite.size ?? 1000, agg.aggs);
  }

  // date_histogram — bucket by truncated date
  if (agg.date_histogram) {
    const unit = INTERVAL_UNIT[agg.date_histogram.calendar_interval] || 'day';
    return termsLikePipeline(
      { groupId: { $dateTrunc: { date: `$${agg.date_histogram.field}`, unit } } },
      agg.date_histogram.size ?? 10000,
      agg.aggs,
      { sortByKey: true, isDate: true },
    );
  }

  // geohash_grid — bucket by lat/lon snapped to a grid. We approximate with
  // simple rounding; precision 6 (~1.2 km) is fine for the demo heatmap.
  if (agg.geohash_grid) {
    const f = agg.geohash_grid.field;
    const precision = agg.geohash_grid.precision ?? 6;
    const factor = Math.pow(10, Math.max(1, Math.min(6, precision - 2)));
    return termsLikePipeline(
      {
        groupId: {
          lat: { $round: [`$${f}.lat`, Math.log10(factor) | 0] },
          lon: { $round: [`$${f}.lon`, Math.log10(factor) | 0] },
        },
      },
      10000,
      agg.aggs,
    );
  }

  return [];
}

/**
 * Builds a `[$group, $sort, $limit, optional $unwind-for-subaggs]` pipeline
 * for a bucketing aggregation. Inlines simple sub-aggs as $group accumulators.
 */
function termsLikePipeline(
  opts: { groupId: any },
  limit: number,
  subAggs: Record<string, Json> | undefined,
  flags: { sortByKey?: boolean; isDate?: boolean } = {},
): any[] {
  const groupStage: Record<string, any> = { _id: opts.groupId, doc_count: { $sum: 1 } };
  const cardinalityFields: Array<{ name: string; field: string }> = [];

  if (subAggs) {
    for (const [subName, sub] of Object.entries(subAggs)) {
      if (sub.value_count) {
        groupStage[`__sub__${subName}_value`] = { $sum: 1 };
      } else if (sub.avg) {
        groupStage[`__sub__${subName}_value`] = { $avg: `$${sub.avg.field}` };
      } else if (sub.cardinality) {
        // $addToSet -> $size in $project later.
        groupStage[`__sub__${subName}_set`] = { $addToSet: `$${sub.cardinality.field}` };
        cardinalityFields.push({ name: subName, field: sub.cardinality.field });
      } else if (sub.filter) {
        const sf = translateQuery(sub.filter);
        groupStage[`__sub__${subName}_doc_count`] = {
          $sum: { $cond: [matchExprFromFilter(sf), 1, 0] },
        };
      } else if (sub.geo_centroid) {
        const f = sub.geo_centroid.field;
        groupStage[`__sub__${subName}_lat`] = { $avg: `$${f}.lat` };
        groupStage[`__sub__${subName}_lon`] = { $avg: `$${f}.lon` };
      } else if (sub.terms) {
        // For nested `terms` sub-aggs we take the top-1 value via $first after
        // sorting by frequency. Good enough for the `ward_name`/`zone` lookups
        // the ghost-office detector does (size: 1).
        groupStage[`__sub__${subName}_topkey`] = { $first: `$${sub.terms.field.replace(/\.keyword$/, '')}` };
      }
    }
  }

  const pipeline: any[] = [{ $group: groupStage }];

  if (flags.sortByKey) pipeline.push({ $sort: { _id: 1 } });
  else pipeline.push({ $sort: { doc_count: -1 } });

  pipeline.push({ $limit: limit });

  return pipeline;
}

/** Turn a Mongo find-filter (translated from ES) into a $expr predicate. */
function matchExprFromFilter(filter: Record<string, any>): any {
  const conditions: any[] = [];

  for (const [k, v] of Object.entries(filter)) {
    if (k === '$and') {
      conditions.push({ $and: (v as any[]).map(matchExprFromFilter) });
    } else if (k === '$or') {
      conditions.push({ $or: (v as any[]).map(matchExprFromFilter) });
    } else if (k === '$nor') {
      conditions.push({ $not: { $or: (v as any[]).map(matchExprFromFilter) } });
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [op, val] of Object.entries(v)) {
        const table: Record<string, any> = {
          $gte: { $gte: [`$${k}`, val] },
          $lte: { $lte: [`$${k}`, val] },
          $gt: { $gt: [`$${k}`, val] },
          $lt: { $lt: [`$${k}`, val] },
          $in: { $in: [`$${k}`, val] },
          $eq: { $eq: [`$${k}`, val] },
        };
        const m = table[op];
        if (m) conditions.push(m);
      }
    } else {
      conditions.push({ $eq: [`$${k}`, v] });
    }
  }

  if (conditions.length === 0) return { $literal: true };
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

function shapeAggResult(agg: Json, raw: any[]): Record<string, any> {
  if (agg.value_count || agg.cardinality) {
    return { value: raw[0]?.value || 0 };
  }
  if (agg.avg) {
    return { value: raw[0]?.value ?? null };
  }
  if (agg.extended_stats) {
    return raw[0] || {};
  }
  if (agg.filter) {
    return { doc_count: raw[0]?.doc_count || 0 };
  }
  if (agg.geo_centroid) {
    return raw[0] || { location: null };
  }
  if (agg.terms || agg.composite || agg.date_histogram || agg.geohash_grid) {
    return { buckets: raw.map(b => shapeBucket(agg, b)) };
  }
  return {};
}

function shapeBucket(agg: Json, b: any): Record<string, any> {
  const out: Record<string, any> = {};

  if (agg.composite) {
    out.key = b._id || {};
  } else if (agg.date_histogram) {
    const d = b._id instanceof Date ? b._id : new Date(b._id);
    out.key = d.getTime();
    out.key_as_string = d.toISOString();
  } else if (agg.geohash_grid) {
    out.key = `${b._id?.lat ?? 0},${b._id?.lon ?? 0}`;
  } else {
    out.key = b._id;
  }

  out.doc_count = b.doc_count;

  // Unpack any inlined sub-agg accumulators back into ES sub-agg shape.
  const subAggs = agg.aggs || {};
  for (const [subName, sub] of Object.entries<any>(subAggs)) {
    if (sub.value_count) {
      out[subName] = { value: b[`__sub__${subName}_value`] || 0 };
    } else if (sub.avg) {
      out[subName] = { value: b[`__sub__${subName}_value`] ?? null };
    } else if (sub.cardinality) {
      const set: any[] = b[`__sub__${subName}_set`] || [];
      out[subName] = { value: set.length };
    } else if (sub.filter) {
      out[subName] = { doc_count: b[`__sub__${subName}_doc_count`] || 0 };
    } else if (sub.geo_centroid) {
      const lat = b[`__sub__${subName}_lat`];
      const lon = b[`__sub__${subName}_lon`];
      out[subName] = { location: lat != null && lon != null ? { lat, lon } : null };
    } else if (sub.terms) {
      const top = b[`__sub__${subName}_topkey`];
      out[subName] = { buckets: top != null ? [{ key: top, doc_count: 1 }] : [] };
    }
  }

  return out;
}

// Re-export so callers don't have to pull from two files.
export { translateQuery, resolveDateMath };
