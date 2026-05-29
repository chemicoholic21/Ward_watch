# Next.js Unification Plan

## Why this restructure

Today the repo is two services (`backend/` Express + `frontend/` Next.js 14) talking over CORS on different ports. That made sense when the backend needed an Elasticsearch SDK with TCP keep-alive, but after the MongoDB migration the backend is just thin HTTP handlers around the Mongo driver — which is exactly what Next.js Route Handlers do natively. Collapsing the two halves into one Next.js project buys us:

- **One deploy target** — Vercel (or any Node host) serves both UI and API from the same origin.
- **No CORS, no rate-limit duplication, no separate env files** — middleware runs once.
- **Free hosting on Vercel free tier** + MongoDB Atlas M0 = zero-dollar end-to-end deploy.
- **Smaller surface to maintain** — one `package.json`, one `tsconfig`, one `node_modules`.
- **Shared types** — the API and the UI can import from the same `lib/` folder; no more drift.
- **Streaming + RSC eligible** — heavy server work (TrustLens analysis, ghost-office scans) can move into Server Components or Server Actions later if we want.

The original deploy plan stays valid — we just replace the "two-service" row with a single Vercel deploy, and the MongoDB Atlas free tier replaces Elastic Cloud.

## Target folder layout

```
/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # ← from frontend/src/app/layout.tsx
│   ├── page.tsx                  # ← from frontend/src/app/page.tsx
│   ├── globals.css               # ← from frontend/src/app/globals.css
│   └── api/                      # All HTTP handlers (replaces Express)
│       ├── complaints/
│       │   ├── route.ts          # GET / POST  (list + create)
│       │   ├── [id]/route.ts     # GET / PATCH (read + update)
│       │   └── stats/summary/route.ts
│       ├── ghost-offices/
│       │   ├── route.ts
│       │   ├── [id]/route.ts
│       │   ├── top/route.ts
│       │   ├── heatmap/route.ts
│       │   └── scan/route.ts
│       ├── trustlens/
│       │   ├── analyze/route.ts
│       │   ├── reports/route.ts
│       │   └── stats/route.ts
│       ├── analytics/
│       │   ├── dashboard/route.ts
│       │   ├── trends/route.ts
│       │   └── civic-health/route.ts
│       ├── search/route.ts
│       ├── agents/
│       │   ├── route.ts
│       │   └── execute/route.ts
│       ├── actions/
│       │   ├── rti/generate/route.ts
│       │   └── escalation/generate/route.ts
│       ├── wards/
│       │   ├── route.ts
│       │   ├── leaderboard/performance/route.ts
│       │   └── zones/summary/route.ts
│       └── health/
│           ├── live/route.ts
│           └── ready/route.ts
├── components/                   # ← from frontend/src/components/
│   └── dashboard/*.tsx
├── lib/
│   ├── api.ts                    # client SDK (now uses relative URLs)
│   ├── utils.ts
│   └── server/                   # server-only code (never imported by client components)
│       ├── config/
│       │   ├── environment.ts    # ← from backend/src/config/environment.ts
│       │   ├── mongodb.ts        # ← from backend/src/config/mongodb.ts
│       │   └── elasticsearch.ts  # backwards-compat shim (ES_INDICES / ES_PIPELINES aliases)
│       ├── mongodb/              # ← from backend/src/services/mongodb/
│       │   ├── client.ts
│       │   ├── query-translator.ts
│       │   └── agg-evaluator.ts
│       ├── elasticsearch/        # backwards-compat shim
│       │   └── client.ts
│       ├── ghost-office/detector.ts
│       ├── openclaw/orchestrator.ts
│       └── trustlens/analyzer.ts
├── scripts/
│   └── seed-mongodb.ts           # ← from backend/src/scripts/seed-mongodb.ts
├── public/
├── middleware.ts                 # CORS + rate limit + security headers
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── package.json                  # merged FE + BE deps
├── docker-compose.yml            # mongo + mongo-express + web (single)
├── .env.example
└── infrastructure/               # untouched (lambdas/ES JSON kept as reference)
```

`frontend/` and `backend/` directories are deleted at the end.

## Express → App Router conversion pattern

| Express                                  | Next.js App Router                                     |
|------------------------------------------|--------------------------------------------------------|
| `router.get('/', handler)`               | `export async function GET(req: NextRequest)`          |
| `router.post('/', handler)`              | `export async function POST(req: NextRequest)`         |
| `router.get('/:id', handler)`            | `app/api/x/[id]/route.ts` → `GET(req, { params })`     |
| `req.query.foo`                          | `req.nextUrl.searchParams.get('foo')`                  |
| `req.body` (after `express.json()`)      | `await req.json()`                                     |
| `req.params.id`                          | `(await params).id` (Next 15) or `params.id` (Next 14) |
| `res.json(data)`                         | `NextResponse.json(data)`                              |
| `res.status(404).json(...)`              | `NextResponse.json(..., { status: 404 })`              |
| `helmet()`                               | `headers()` in `next.config.js`                        |
| `cors()`                                 | `middleware.ts` setting `Access-Control-*` headers     |
| `express-rate-limit`                     | in-memory LRU in `middleware.ts` (or Upstash for prod) |
| `morgan`                                 | dropped (Vercel/Node logs stdout already)              |

All `esService.*` calls are unchanged — the MongoDB shim from the previous migration still works.

## Dependency consolidation

The new root `package.json` merges both lockfiles. Dropped because Next.js owns them now:

- `express`, `@types/express`
- `cors`, `@types/cors`
- `helmet`
- `morgan`, `@types/morgan`
- `express-rate-limit`
- `tsx` (only kept as a `devDependencies` entry to run the seed script)

Kept:

- All `@radix-ui/*`, `chart.js`, `recharts`, `leaflet`, `framer-motion` etc. (frontend deps)
- `mongodb` (from the prior migration)
- `zod`, `uuid`, `sanitize-html`, `dotenv`
- AWS SDK packages remain — still gated by feature flags

## Env vars (single `.env.local`)

```
# Database
MONGO_URI=mongodb://localhost:27017
MONGO_DB=ghostoffice

# Public (shipped to browser)
NEXT_PUBLIC_API_URL=          # leave empty → same-origin

# Optional AWS
ENABLE_BEDROCK=false
ENABLE_LAMBDA=false
ENABLE_SNS=false

# Optional security
JWT_SECRET=changeme
API_KEY_SECRET=changeme
```

## Deploy targets (revised from your plan)

| Concern            | New target                                   | Cost   |
|--------------------|-----------------------------------------------|--------|
| Web (UI + API)     | **Vercel** (`vercel --prod` at repo root)    | Free   |
| Database           | **MongoDB Atlas M0**                          | Free   |
| Image/file storage | (Optional) Vercel Blob or S3                  | Free tier |
| Cron (scans)       | Vercel Cron triggering `/api/ghost-offices/scan` | Free |

No CORS to configure. No backend service to host separately. The whole stack ships with one `vercel --prod`.

## Step-by-step execution order

1. Write this plan (you are here).
2. Scaffold root `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`.
3. Move `frontend/src/{app,components,lib}` → root.
4. Move `backend/src/{services,config}` → `lib/server/`; rewrite all internal imports (`../../services/...` → `@/lib/server/...`).
5. Convert each of the 9 Express routers to App Router handlers under `app/api/`.
6. Add `middleware.ts` for CORS / rate-limit / security headers.
7. Update `lib/api.ts` so `API_BASE` defaults to `''` (same-origin).
8. Move seed script + update `docker-compose.yml` (drop the `frontend` and `backend` services, add a single `web` service that builds the Next.js Dockerfile).
9. Delete `frontend/` and `backend/` directories.
10. `npm install` + `npm run build` to confirm the project compiles.
11. Boot `npm run dev`, hit `/`, `/api/health/live`, `/api/trustlens/analyze`. Confirm graceful degradation when Mongo is offline.

## Note on current backend state

The conversation history described a previous MongoDB migration, but `git log` on this branch shows only the initial commit and `backend/package.json` still depends on `@elastic/elasticsearch`. The restructure below works regardless — folders and routes move identically whether the underlying client is `esService` or a future `mongoService`. If the MongoDB swap needs to happen on this branch, do it AFTER the restructure (one file: `lib/server/elasticsearch/client.ts`).

## What we are deliberately NOT doing

- Not porting handlers into Server Components / Server Actions yet — that's a follow-up. We keep them as `/api/*` route handlers so the existing client `fetch` calls in `lib/api.ts` keep working unchanged.
- Not adopting `next-auth` — auth is still a TODO in the original plan; this migration doesn't change that.
- Not rewriting any business logic. The `ghost-office`, `trustlens`, `openclaw` services move as-is.
- Not changing the MongoDB layer at all — the shim stays.
