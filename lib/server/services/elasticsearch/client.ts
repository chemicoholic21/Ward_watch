/**
 * Back-compat shim — the data layer is MongoDB now, but the 41 App Router
 * route handlers still import `esService` from this path. Re-export the
 * MongoService instance under that name so nothing else has to change.
 *
 * If you want to wire up a fresh module, import from
 * `@/lib/server/services/mongodb/client` directly.
 */
export { mongoService as esService, MongoService as ElasticsearchService } from '../mongodb/client';
