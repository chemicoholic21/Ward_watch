# MongoDB Setup Guide

Pick **one** of the two paths below. Either works for development; Atlas is the one you'll want for a deployed app since it's free forever and you don't have to host anything.

> Heads-up: the application code currently talks to Elasticsearch, not MongoDB. Standing up MongoDB doesn't make the app use it — the code migration is a separate step (`lib/server/services/elasticsearch/client.ts` is the one file that needs to be rewritten to use the `mongodb` driver). This guide just gets you a running MongoDB instance ready for that swap.

---

## Option A — Local MongoDB via Docker (fastest)

Pre-req: Docker Desktop / Docker Engine.

```bash
# From the repo root:
docker-compose up -d mongo mongo-express
```

That gives you:

| Service        | URL                              | Auth                |
|----------------|----------------------------------|---------------------|
| MongoDB        | `mongodb://localhost:27017`      | none (dev)          |
| Mongo Express  | `http://localhost:8081`          | `admin` / `pass`    |

Set in `.env.local`:

```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB=ghostoffice
```

Verify the connection:

```bash
docker exec -it ghostoffice-mongo mongosh --eval "db.runCommand({ ping: 1 })"
# → { ok: 1 }
```

Tear down (keeps data in the `mongo_data` volume):

```bash
docker-compose stop mongo mongo-express
```

Wipe data:

```bash
docker-compose down -v
```

---

## Option B — MongoDB Atlas free tier (M0, ~5 min, recommended for deploy)

Atlas's M0 cluster is permanently free (512 MB storage, shared CPU). Plenty for this app.

### 1. Create the account & cluster

1. Go to <https://www.mongodb.com/cloud/atlas/register> and sign up (email or Google).
2. Pick **Build a Database** → **M0 FREE** tier.
3. Pick a provider (AWS / GCP / Azure — pick whichever region is closest to you; AWS Mumbai if you're in India).
4. Click **Create Cluster**. Provisioning takes ~3 minutes.

### 2. Create a database user

1. In the Atlas left nav: **Database Access** → **+ Add New Database User**.
2. Auth method: **Password**.
3. Username: `ghostoffice` (or whatever). Click **Autogenerate Secure Password** and **copy the password** — you can't view it again.
4. Built-in role: **Read and write to any database**.
5. **Add User**.

### 3. Allow your network

1. Left nav: **Network Access** → **+ Add IP Address**.
2. For a deployed app on Vercel/Render: click **Allow Access from Anywhere** (`0.0.0.0/0`). Atlas warns about this but it's fine because the database user auth still applies — and Vercel functions don't have static IPs.
3. For local dev only: **Add Current IP Address**.
4. **Confirm**.

### 4. Grab the connection string

1. Left nav: **Database** → **Connect** on your cluster.
2. **Drivers** → **Node.js**, latest version.
3. Copy the string. It looks like:
   ```
   mongodb+srv://ghostoffice:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
4. Replace `<password>` with the password you copied in step 2.

### 5. Wire it into the app

Put it in `.env.local` (and your Vercel/Render env vars for prod):

```env
MONGO_URI=mongodb+srv://ghostoffice:YOUR_PASSWORD@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
MONGO_DB=ghostoffice
```

### 6. (Optional) Sanity-check from your terminal

If you have `mongosh` installed:

```bash
mongosh "mongodb+srv://cluster0.abcde.mongodb.net/" --username ghostoffice
# → connection succeeded
```

Or, without installing anything, use Atlas's built-in **Browse Collections** button on the cluster — that's the hosted equivalent of Mongo Express.

---

## After provisioning — code migration

Once you have `MONGO_URI` working, the next step is to swap the data layer:

1. Replace `lib/server/services/elasticsearch/client.ts` with a MongoDB-backed implementation that exposes the same method surface (`search`, `get`, `index`, `update`, `aggregate`, `count`, `vectorSearch`).
2. Add a small `lib/server/services/mongodb/query-translator.ts` that converts the ES Query DSL JSON the route handlers pass in (`bool`, `term`, `range`, `match`, `geo_distance`, etc.) into MongoDB filters.
3. Add `lib/server/services/mongodb/agg-evaluator.ts` for the aggregation translation (`terms` → `$group`, `date_histogram` → `$dateTrunc`, `cardinality` → `$addToSet` + `$size`, etc.).
4. Drop `@elastic/elasticsearch` from `package.json`, add `mongodb`.
5. Re-seed with a new `scripts/seed-mongodb.js`.

All 41 App Router route handlers stay unchanged — they only ever talk to `esService`, so swapping what `esService` is behind the scenes is enough.
