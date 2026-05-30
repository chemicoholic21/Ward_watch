/**
 * Translates the Elasticsearch Query DSL (the JSON shape the legacy route
 * handlers pass) into MongoDB filter objects.
 *
 * Supports the subset the GhostOffice routes actually use:
 *   match_all, match, multi_match, match_phrase_prefix, more_like_this,
 *   term, terms, range,
 *   bool { must, must_not, should, filter },
 *   geo_distance, geo_bounding_box.
 *
 * Also resolves ES date math expressions like "now-30d", "now-24h", "now"
 * to ISO timestamps so range queries on date fields work.
 */

type Json = any;

/** Resolves ES date math (`now-7d`, `now-30d`, `now-24h`, `now`) to a Date. */
export function resolveDateMath(value: any): any {
  if (typeof value !== 'string') return value;
  const m = value.match(/^now(?:-(\d+)([smhdwMy]))?(?:\/.+)?$/);
  if (!m) return value; // not date math
  const now = Date.now();
  if (!m[1]) return new Date(now);
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const ms = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000, // approximate
    y: 365 * 24 * 60 * 60 * 1000,
  }[unit];
  if (!ms) return value;
  return new Date(now - n * ms);
}

/** Convert an ES range body (`{ gte, lte, gt, lt }`) into Mongo operators. */
function translateRange(body: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  if ('gte' in body) out.$gte = resolveDateMath(body.gte);
  if ('lte' in body) out.$lte = resolveDateMath(body.lte);
  if ('gt' in body) out.$gt = resolveDateMath(body.gt);
  if ('lt' in body) out.$lt = resolveDateMath(body.lt);
  return out;
}

/** geo_distance: ES "5km" / "500m" / number → Mongo radians. */
function distanceToRadians(distance: number | string): number {
  const earthRadiusKm = 6378.1;
  if (typeof distance === 'number') return distance / 1000 / earthRadiusKm;
  const m = String(distance).match(/^([\d.]+)\s*(km|m|mi|yd)?$/);
  if (!m) return Number(distance) / earthRadiusKm;
  const n = parseFloat(m[1]);
  const unit = m[2] || 'm';
  const km = unit === 'km' ? n : unit === 'm' ? n / 1000 : unit === 'mi' ? n * 1.60934 : n * 0.0009144;
  return km / earthRadiusKm;
}

/** Coerce a geo_point in `{ lat, lon }` or `[lon, lat]` form to `[lon, lat]`. */
function toLonLat(point: any): [number, number] | null {
  if (Array.isArray(point) && point.length >= 2) return [point[0], point[1]];
  if (point && typeof point === 'object' && 'lat' in point && 'lon' in point) return [point.lon, point.lat];
  return null;
}

/** ES `geo_distance` → Mongo `$geoWithin: { $centerSphere }`. */
function translateGeoDistance(body: any): Record<string, any> {
  // Body shape: { distance: "5km", <field>: <point> } OR { distance, <field>: ... }
  const { distance, ...rest } = body;
  const field = Object.keys(rest)[0];
  const point = rest[field];
  const lonLat = toLonLat(point);
  if (!field || !lonLat) return {};
  return { [`${field}._geo`]: { $geoWithin: { $centerSphere: [lonLat, distanceToRadians(distance)] } } };
}

/** ES `geo_bounding_box` → Mongo `$geoWithin: { $box }`. */
function translateGeoBoundingBox(body: any): Record<string, any> {
  const field = Object.keys(body)[0];
  const box = body[field];
  const topLeft = toLonLat(box?.top_left);
  const bottomRight = toLonLat(box?.bottom_right);
  if (!field || !topLeft || !bottomRight) return {};
  // Mongo $box wants [[swLon, swLat], [neLon, neLat]]
  const sw: [number, number] = [topLeft[0], bottomRight[1]];
  const ne: [number, number] = [bottomRight[0], topLeft[1]];
  return { [`${field}._geo`]: { $geoWithin: { $box: [sw, ne] } } };
}

/** Recursive ES → Mongo filter. */
export function translateQuery(esQuery: Json): Record<string, any> {
  if (!esQuery || typeof esQuery !== 'object') return {};

  // match_all
  if (esQuery.match_all) return {};

  // term
  if (esQuery.term) {
    const field = Object.keys(esQuery.term)[0];
    const value = esQuery.term[field];
    const v = typeof value === 'object' && value !== null && 'value' in value ? value.value : value;
    return { [field]: v };
  }

  // terms
  if (esQuery.terms) {
    const field = Object.keys(esQuery.terms)[0];
    return { [field]: { $in: esQuery.terms[field] } };
  }

  // range
  if (esQuery.range) {
    const field = Object.keys(esQuery.range)[0];
    return { [field]: translateRange(esQuery.range[field]) };
  }

  // match — treat as case-insensitive regex (Mongo $text would need a text
  // index per collection; regex is good enough for the demo dataset).
  if (esQuery.match) {
    const field = Object.keys(esQuery.match)[0];
    const value = esQuery.match[field];
    const q = typeof value === 'object' ? value.query : value;
    return { [field]: { $regex: escapeRegex(String(q)), $options: 'i' } };
  }

  // multi_match — search across several fields with $or of regexes.
  if (esQuery.multi_match) {
    const { query, fields = [] } = esQuery.multi_match;
    const safe = escapeRegex(String(query));
    const cleanFields: string[] = (fields as string[]).map(f => f.replace(/\^\d+$/, ''));
    return { $or: cleanFields.map(f => ({ [f]: { $regex: safe, $options: 'i' } })) };
  }

  // match_phrase_prefix
  if (esQuery.match_phrase_prefix) {
    const field = Object.keys(esQuery.match_phrase_prefix)[0];
    const body = esQuery.match_phrase_prefix[field];
    const q = typeof body === 'object' ? body.query : body;
    return { [field]: { $regex: `^${escapeRegex(String(q))}`, $options: 'i' } };
  }

  // more_like_this — degrade to match_all; the route post-processes results.
  if (esQuery.more_like_this) {
    return {};
  }

  // geo_distance
  if (esQuery.geo_distance) return translateGeoDistance(esQuery.geo_distance);

  // geo_bounding_box
  if (esQuery.geo_bounding_box) return translateGeoBoundingBox(esQuery.geo_bounding_box);

  // bool
  if (esQuery.bool) {
    const { must = [], must_not = [], should = [], filter = [] } = esQuery.bool;

    const andClauses: any[] = [];
    for (const clause of [...arr(must), ...arr(filter)]) {
      const t = translateQuery(clause);
      if (Object.keys(t).length) andClauses.push(t);
    }

    const norClauses: any[] = [];
    for (const clause of arr(must_not)) {
      const t = translateQuery(clause);
      if (Object.keys(t).length) norClauses.push(t);
    }

    const orClauses: any[] = [];
    for (const clause of arr(should)) {
      const t = translateQuery(clause);
      if (Object.keys(t).length) orClauses.push(t);
    }

    const out: Record<string, any> = {};
    if (andClauses.length === 1) Object.assign(out, andClauses[0]);
    else if (andClauses.length > 1) out.$and = andClauses;
    if (norClauses.length) out.$nor = norClauses;
    if (orClauses.length) out.$or = orClauses;
    return out;
  }

  return {};
}

function arr<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
