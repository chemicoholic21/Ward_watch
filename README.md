# WardWatch

Civic observability for Bengaluru. Treats municipal infrastructure as a distributed system — complaints are telemetry, department transfers are trace spans, unresponsive offices are dead zones (“ghost offices”), and outage-correlated scam spikes are anomalies.

A single Next.js 14 app: dashboard + API + LLM agents. MongoDB for storage, Groq (free tier, Llama 3.3 70B) for the agents.

## Quick start

```bash
git clone https://github.com/chemicoholic21/ward_watch.git
cd ward_watch
cp .env.example .env.local
npm install
docker-compose up -d mongo            # or set MONGO_URI to an Atlas cluster
npm run seed                          # 5k complaints + 500 scams + wards
npm run dev                           # http://localhost:3000
```

Optional — to enable the LLM agent chat:

```bash
echo "GROQ_API_KEY=gsk_..." >> .env.local   # free key: console.groq.com/keys
```

## Stack

Next.js 14 · TypeScript · Tailwind · MongoDB · Vercel AI SDK + Groq · Vercel

## Deploy

`vercel --prod` from the repo root. Set `MONGO_URI` and `GROQ_API_KEY` in Vercel env vars. Full walkthrough in [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md).

## Docs

- [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md) — Atlas + Vercel
- [`docs/MONGODB_SETUP.md`](docs/MONGODB_SETUP.md) — local Docker or Atlas
- [`docs/AGENTS_GUIDE.md`](docs/AGENTS_GUIDE.md) — how the LLM agents work, how to add tools

## License

MIT
