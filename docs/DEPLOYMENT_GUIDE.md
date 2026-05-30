# Atlas + Vercel Deployment Guide

End-to-end walkthrough: a free MongoDB Atlas M0 cluster and a free Vercel project. Total time ~10–15 minutes the first time. Total cost: $0/month forever.

> **Important — current code talks to Elasticsearch, not MongoDB.** If you deploy this branch as-is, the UI loads at your Vercel URL but every DB-backed API route returns connection errors because there's no Elasticsearch reachable. The only endpoint that works without a DB is `POST /api/trustlens/analyze`. If you want a fully working deploy, do the ES→Mongo code swap **before** you ship. See "What gets you a fully working deploy" at the bottom.

---

## Part 1 — MongoDB Atlas M0 (~5 min)

### Step 1.1 — Create the account

1. Open <https://www.mongodb.com/cloud/atlas/register>.
2. Sign up with email or Google. No credit card needed.
3. Atlas will ask you a few onboarding questions (org name, project name). Defaults are fine.

### Step 1.2 — Create the M0 cluster

1. You'll land on **Deploy your database**. Choose **M0 FREE**.
2. **Provider & region**: pick whichever is closest to your users. If you're in India and you'll later deploy to Vercel's Mumbai region (see Part 2), pick **AWS** + **ap-south-1 (Mumbai)** here too — co-locating cuts ~150ms off every query.
3. **Cluster name**: leave the default (`Cluster0`) or rename.
4. Click **Create Deployment**. Provisioning takes ~2–3 min.

### Step 1.3 — Database user

While the cluster spins up, Atlas pops a **Security Quickstart** modal.

1. **Authentication method**: Username and password.
2. **Username**: `wardwatch` (or anything).
3. **Password**: click **Autogenerate Secure Password**, then **Copy** it somewhere safe — Atlas won't show it again.
4. Click **Create User**.

### Step 1.4 — Network access

Same Security Quickstart, scroll down to **Where would you like to connect from?**

- **For Vercel deploys (recommended):** click **My Local Environment** → **Add IP Address** → **Allow Access From Anywhere** (`0.0.0.0/0`). Vercel serverless functions don't get static IPs, so an allow-list won't work. Atlas warns about this, but the database user password still gates access — it's fine.
- **For local dev only:** click **Add Current IP Address** — Atlas auto-detects yours.

Click **Finish and Close**, then **Go to Overview**.

### Step 1.5 — Grab the connection string

1. On the cluster card, click **Connect**.
2. Choose **Drivers** → **Node.js** → latest version.
3. Copy the connection string. Looks like:
   ```
   mongodb+srv://wardwatch:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
4. Paste it somewhere safe and replace `<password>` with the password from Step 1.3. URL-encode `@`/`:`/`/` if your password contains them.

You now have your `MONGO_URI`. Keep it handy for Part 2.

### Step 1.6 — (Optional) sanity check

Click **Browse Collections** on the cluster. You'll see an empty database. That's expected — there's nothing seeded yet.

---

## Part 2 — Vercel deploy (~5 min)

### Step 2.1 — Push your code to GitHub

Vercel deploys best from a Git repo. If you haven't already:

```bash
gh repo create wardwatch --public --source=. --push
# or, if the repo exists:
git remote add origin https://github.com/chemicoholic21/ward_watch.git
git push -u origin main
```

> The agent branch (`agent/sharp-frost-nauz`) is fine to deploy too — you'd just point Vercel at that branch in Step 2.3.

### Step 2.2 — Create the Vercel account

1. Go to <https://vercel.com/signup>.
2. Sign up with **Continue with GitHub** (easiest — auto-grants repo access).

### Step 2.3 — Import the project

1. On the Vercel dashboard, **Add New…** → **Project**.
2. Pick your `wardwatch` repo from the list. Click **Import**.
3. **Framework Preset**: Vercel auto-detects **Next.js** from `next.config.js`.
4. **Root Directory**: leave as `.` (we're a single-project repo now).
5. **Build & Output Settings**: leave as defaults — `vercel.json` in the repo already pins:
   - Build: `next build`
   - Install: `npm install`
   - Region: `bom1` (Mumbai)
   - Function memory: 1024 MB
   - Function max duration: 30 s
6. **DO NOT click Deploy yet.** Expand **Environment Variables** first (Step 2.4).

### Step 2.4 — Set environment variables

In the **Environment Variables** panel, add these. The "Environment" column should be **Production, Preview, and Development** for all of them (Vercel's default).

| Variable | Value | Required? |
|----------|-------|-----------|
| `MONGO_URI` | the `mongodb+srv://...` string from Step 1.5 | ✅ once you do the code swap |
| `MONGO_DB` | `wardwatch` | ✅ once you do the code swap |
| `NODE_ENV` | `production` | optional (Vercel sets it) |
| `ENABLE_BEDROCK` | `false` | ✅ keeps AWS calls disabled |
| `ENABLE_LAMBDA` | `false` | ✅ |
| `ENABLE_SNS` | `false` | ✅ |
| `JWT_SECRET` | any random 32+ char string | recommended |
| `API_KEY_SECRET` | any random 32+ char string | recommended |
| `RATE_LIMIT_WINDOW_MS` | `900000` | optional |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | optional |

Quick way to generate secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Do NOT set `NEXT_PUBLIC_API_URL`** — leaving it empty makes the frontend hit `/api/*` on the same Vercel origin, which is what you want.

> If you're shipping with Elasticsearch (not Mongo) and you have an ES Cloud cluster, set `ES_NODE`, `ES_CLOUD_ID`, `ES_API_KEY` instead. But the recommended path is Atlas.

### Step 2.5 — Deploy

1. Click **Deploy**.
2. Vercel runs `npm install` → `next build` → bundles the 41 API routes as serverless functions → publishes the static frontend.
3. First deploy takes ~3 min. You'll get a URL like `https://wardwatch-yourname.vercel.app`.

### Step 2.6 — Verify the deploy

Open your Vercel URL and check:

| Endpoint | Expected |
|----------|----------|
| `/` | Dashboard UI renders |
| `/api/health/live` | `{ "live": true, ... }` |
| `/api/health/ready` | **503** if you haven't done the Mongo swap yet (it pings ES, which doesn't exist) |
| `POST /api/trustlens/analyze` with `{ "content": "URGENT pay BESCOM fine OTP" }` | Returns `risk_level: "critical"` — DB-independent, works regardless |
| `/api/agents` | Returns the agent list — DB-independent |
| Any other DB-backed route (e.g. `/api/complaints`) | Connection error until either ES or Mongo is wired up |

That's the expected state for "Vercel deploy without code migration." If you want everything green, do the code swap below first.

---

## Part 3 — What gets you a fully working deploy

The current 41 API routes call `esService.search/get/index/aggregate/...`. Until something is reachable at `process.env.ES_NODE` or `process.env.ES_CLOUD_ID`, those routes fail. Two options to fix:

### Option A — Do the ES→Mongo code migration (recommended)

One file gets rewritten: `lib/server/services/elasticsearch/client.ts` becomes a thin wrapper around the `mongodb` driver that exposes the same method surface. Plus two new helpers (`query-translator.ts`, `agg-evaluator.ts`) that translate the ES Query DSL JSON the routes pass in. None of the 41 route files change.

I can do this in a follow-up — just say the word and confirm your `MONGO_URI` is set in Vercel.

### Option B — Keep ES, use Elastic Cloud free trial

If you'd rather not migrate:

1. Sign up at <https://cloud.elastic.co/registration> (new account if your trial expired).
2. Create a deployment, copy the **Cloud ID** and an **API key**.
3. In Vercel env vars: set `ES_CLOUD_ID` and `ES_API_KEY` (leave `ES_NODE` blank).
4. Redeploy: Vercel dashboard → Deployments → **⋯** → **Redeploy**.

The trial is 14 days, so Option A is the only no-ongoing-cost path.

---

## Part 4 — Seeding the production database

You can seed Atlas from your local machine:

```bash
# After the Mongo code migration ships, this will be:
MONGO_URI="<your Atlas string>" MONGO_DB=wardwatch npm run seed
# Until then, the existing scripts/seed-data.js seeds Elasticsearch instead.
```

This drops in ~5000 complaints, ~500 scam reports, ~45 ghost offices, and 198 Bengaluru wards. Run it once after the cluster is created. (Atlas's free tier is shared compute, so it takes a couple minutes.)

---

## Part 5 — Iterating after the first deploy

Every push to your default branch triggers a new production deploy. Every push to any other branch triggers a preview deploy at a unique URL. To rollback, go to **Deployments** in the Vercel dashboard, click the older deployment, **Promote to Production**.

To change env vars without code changes: **Settings** → **Environment Variables**, edit, then **Deployments** → **Redeploy** (env changes don't auto-rebuild).

---

## Troubleshooting

**Build fails on `@elastic/elasticsearch` / `undici`:**
Already handled — `next.config.js` has `serverComponentsExternalPackages: ['@elastic/elasticsearch', 'undici']`. If you fork and remove that, the build will fail with "Module parse failed: Unexpected token" in `undici`.

**`/api/health/ready` returns 503 in production:**
That's correct unless you've wired up either ES or Mongo. The readiness probe pings the DB; without one, it reports unready. The liveness probe (`/api/health/live`) doesn't care and still returns 200.

**Atlas connection times out from Vercel:**
You set Network Access to your IP instead of `0.0.0.0/0`. Vercel serverless IPs are dynamic. Re-add `0.0.0.0/0` in **Network Access**.

**Rate-limit returns 429 unexpectedly:**
The in-memory rate-limit bucket in `middleware.ts` is per-Vercel-instance, not global. Cold-start a fresh instance and the count resets. For accurate global rate limiting, swap to Upstash Redis (`@upstash/ratelimit`) — `middleware.ts` is set up to make this a 5-line change.

**Cold starts feel slow on first hit:**
Vercel functions cold-start on idle. The ghost-office aggregation routes can take 2–3 seconds on cold start because of the ES SDK bundle size. Hot subsequent hits are <300 ms. Upgrade to Pro for warm starts, or keep one route warm with a Vercel Cron `GET /api/health/live` every minute.
