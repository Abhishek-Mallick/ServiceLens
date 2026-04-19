# ServiceLens

Infers API contracts and event flows from Git-backed microservices, maps live topology, and runs end-to-end regression tests with animated playback and real-time health rollups.

Built to be **cheap and fast to run** — Neon Postgres (free tier) for storage, OpenRouter's free tier for AI (with a full heuristic fallback), simulated health checks so you can play with the full experience without deploying anything.

![dashboard](./docs/screenshot-dashboard.png) *(screenshot placeholder — capture `/dashboard` after seeding)*

---

## Stack

| Layer         | Tech                                                             |
| ------------- | ---------------------------------------------------------------- |
| Framework     | Next.js 14 (App Router), TypeScript, React 18                    |
| UI            | Tailwind CSS, shadcn/ui (Radix), Lucide icons, Framer Motion     |
| Data viz      | React Flow + dagre (topology), Recharts (dashboards)             |
| Backend       | Next.js Route Handlers, Prisma ORM                               |
| Database      | Neon Postgres (serverless) via Prisma                            |
| Auth          | NextAuth (Credentials + optional GitHub OAuth)                   |
| AI            | OpenRouter free-tier models (graceful heuristic fallback)        |
| Git           | `simple-git` — shallow clones, analyzes source without full history |
| Realtime      | Socket.IO (scaffolded for live health broadcasts)                |
| Tests         | Vitest (unit), Playwright (E2E)                                  |

---

## Quickstart

```bash
# 1. install
npm install

# 2. provision a Neon database
# - Create a project at https://console.neon.tech
# - Copy the POOLED connection string  → DATABASE_URL
# - Copy the DIRECT (unpooled) string  → DIRECT_URL

# 3. configure env
cp .env.example .env
# paste both Neon URLs, set NEXTAUTH_SECRET to a random 32+ char string.
# OPENROUTER_API_KEY is optional; without it the app uses the heuristic analyzer.

# 4. push schema + seed data to Neon
npm run prisma:generate
npm run prisma:push      # uses DIRECT_URL
npm run prisma:seed      # inserts demo user + E-Commerce Platform

# 5. run
npm run dev
# → http://localhost:3000
```

### Demo login

The seed creates a demo user and a fully-populated architecture:

- **Email:** `demo@servicelens.com`
- **Password:** `demo123`

Seeded data:

- 1 architecture — **E-Commerce Platform**
- 10 services (API Gateway, User, Product, Order, Payment, Inventory, Notification, Shipping, Analytics, Search)
- ~3,360 health records spanning the last 7 days at 30-minute intervals (deterministic per service, so the dashboards look alive)
- 3 completed regression runs with 20 steps each

---

## Hero features

### 1. AI-powered service ingestion

`POST /api/services` accepts a Git repo URL. `lib/git-analyzer.ts` does a `--depth 1` shallow clone, `lib/code-analyzer.ts` extracts the interesting files (`package.json`, route files, event producers/consumers, DB bindings), and `lib/openrouter.ts` asks a free-tier model to return a structured analysis: language, framework, exposed APIs, consumed APIs, produced/consumed events, Kafka topics, databases, health endpoint.

If `OPENROUTER_API_KEY` is unset or the call fails, the heuristic analyzer (`heuristicAnalyze`) covers the common frameworks (Express, NestJS, FastAPI, Flask, Spring Boot, Go stdlib, and friends) via regex extraction over the same files. **The app works without any AI key.**

### 2. Topology visualization

`lib/topology-builder.ts` takes all services and their extracted APIs/events/databases and returns a `{ graph, dependencies }` tuple. `components/topology/topology-view.tsx` renders it with React Flow + a dagre left-to-right layout. Three custom node types (service rectangle with health dot, cylinder for databases, rotated diamond for Kafka brokers) and four edge types (REST, event, gRPC, database). Clicking a service opens a side sheet with full analysis details and health history.

### 3. End-to-end regression testing

`lib/regression-engine.ts` discovers flows from the topology itself — event chains walking from producers through brokers to consumers, a health sweep over everything, and contract validation for REST edges. `executeRegressionRun()` creates a run + step records with realistic pass/fail distributions (Payment and Search are wired to fail more often, matching the health simulation).

The UI (`components/regression/regression-runner.tsx`) POSTs to the API and then **animates the topology step-by-step**, pulsing the edges as each step runs. Results land in a history list with per-step outputs and errors.

### 4. Real-time health monitoring

`lib/health-monitor.ts` simulates per-service health deterministically (seeded by service name + current minute via `mulberry32`), with a few services hardcoded to degrade or go down on a schedule. `components/health/health-dashboard.tsx` polls every 30 seconds and renders:

- Per-service cards with sparklines and response-time readouts
- Uptime percentages across 24h / 7d / 30d windows
- An alerts panel for anything currently degraded or down
- A Recharts area chart of the last 24 hours

---

## Tests

```bash
# unit (Vitest) — code-analyzer, topology-builder, health-monitor
npm test

# end-to-end (Playwright) — login, architecture creation, topology render
npx playwright install chromium     # first run only
npm run test:e2e
```

Playwright boots its own `next dev` on port 3100 (configurable via `E2E_PORT` / `E2E_BASE_URL`). The suite assumes the seed data is present — run `npm run prisma:seed` once beforehand.

Type-check without building:

```bash
npm run typecheck
```

## Database notes

- Neon's pooled URL must include `?sslmode=require&pgbouncer=true&connection_limit=1` — the template in `.env.example` already has this.
- `prisma db push` and the seed use `DIRECT_URL` (via the `directUrl` field in `schema.prisma`), so long-running DDL and bulk inserts don't go through PgBouncer.
- To reseed: `npm run db:reset` (force-resets the schema, then re-runs the seed).
- All JSON-ish fields on Service / RegressionRun are stored as `String` and decoded with `parseJson<T>()` — the schema has no Postgres-specific column types, so migrations stay boring.

---
