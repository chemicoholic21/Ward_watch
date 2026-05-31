# Contributing

Thanks for the interest. PRs welcome.

## Setup

See [README](README.md). Short version:

```bash
git clone https://github.com/chemicoholic21/ward_watch.git
cd ward_watch
cp .env.example .env.local
npm install
docker-compose up -d mongo
npm run seed
npm run dev
```

## Workflow

1. Open an issue first for anything non-trivial — saves wasted work.
2. Branch off `main`.
3. Keep commits small and well-described. One logical change per commit.
4. Before pushing: `npm run build` must pass. `npm run lint` should be clean.
5. Open a PR with a brief summary of what and why.

## Project layout

```
app/                  Next.js App Router
  api/                HTTP handlers (one route.ts per path)
  page.tsx, layout    Dashboard UI
lib/
  api.ts              Frontend → API client
  server/             Server-only modules
    services/         Data services (mongodb, agents, ghost-office, trustlens)
    config/           Env + Mongo connection
scripts/seed-mongodb.mjs   Sample data seeder
docs/                 Setup, deployment, agents guides
```

## Style

- TypeScript, strict mode. No `any` unless you have a good reason.
- Tailwind classes, no inline styles. Palette tokens (`bg-bg`, `text-fg-muted`, `border-line`, …) live in `app/globals.css` — change colors there, not in components.
- LLM agent tools go in `lib/server/services/agents/tools.ts` and follow the existing `tool({ description, inputSchema, execute })` shape. See [`docs/AGENTS_GUIDE.md`](docs/AGENTS_GUIDE.md).
- New API routes: `app/api/<path>/route.ts`, export `GET` / `POST` / `PATCH`. Use `NextResponse.json({ success, data, error })` for response shape consistency.

## What's in scope

- Bug fixes
- New agent tools and prompts
- Better data ingestion (real BBMP / OSM / Reddit feeds)
- Accessibility, performance, mobile UX
- Tests (currently none — opinionated test setup PRs welcome)

## What's not

- Renaming `ghost_offices`, `civic_events`, or other collections without a migration plan
- Adding paid third-party services without a feature flag
- Architecture overhauls without a prior issue

## License

By contributing, you agree your work is licensed under the [MIT License](LICENSE).
