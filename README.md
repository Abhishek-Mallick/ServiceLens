# ServiceLens

> The mesh, observed. Map Git-backed microservices, run real probes + alert rules,
> open incidents (manually or via chaos drills), stream an AI root-cause analysis,
> and generate a fix-PR diff — all on free tiers.

ServiceLens is a full-stack **AI SRE simulation platform**. It infers contracts and event flows from a microservice mesh, watches it with declarative probes + JSON-DSL alert rules, opens lifecycle-managed incidents, and uses an LLM (via OpenRouter's free tier) to stream a root-cause analysis and a suggested fix-PR diff. Every dependency is either free or has a generous free tier; the entire app degrades gracefully when no API keys are configured.

## What's inside

| Subsystem | What it does | Where |
|---|---|---|
| **Topology** | Infers + renders a service graph from each repo via `simple-git` + an LLM/heuristic analyzer | `lib/{git,code,topology}-analyzer.ts`, `components/topology/` |
| **Probes** | HTTP / TCP probes per service, sandboxed clones, rate-limited URL validator | `lib/probes.ts`, `lib/git-analyzer.ts` |
| **Alert rules** | JSON-DSL conditions (`status_eq`, `p95_latency_gt`, `error_rate_gt`, `consecutive_down`, `regression_failed`) evaluated after every probe | `lib/alert-rules.ts` |
| **Incidents** | Lifecycle state machine (`open / acknowledged / resolved`), dedup, runbook memory, full audit timeline | `lib/incidents.ts` |
| **Logs** | HEC-style ingest (bearer token per service), SSE live tail, synthetic generator correlated with health | `lib/logs.ts`, `app/api/services/:id/logs` |
| **AI SRE** | Streamed RCA prompt assembly with log + neighbor health + runbook RAG; structured fix-PR JSON output | `lib/rca.ts`, `lib/fix-pr.ts`, `lib/openrouter-stream.ts` |
| **Notifications** | In-app feed, email (Resend), Slack webhook, magic-link incident ack | `lib/notify/` |
| **Realtime** | In-process pub/sub on a multiplexed SSE channel; live topology pulses, live health, live bell | `lib/realtime.ts`, `app/api/architectures/:id/events` |
| **Chaos drills** | Scheduled fault injection (`kill_service / degrade / latency_spike`) + manual trigger + cron tick | `lib/chaos.ts`, `app/api/cron/tick` |
| **Multi-user** | Architecture membership with `owner / editor / viewer` roles, audit log on every mutating action | `lib/membership.ts`, `lib/audit.ts` |
| **UI** | Resend dark editorial design system (`DESIGN.md`), ⌘K command palette, leader-key shortcuts | `app/`, `components/`, `tailwind.config.ts` |

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript, React 18 |
| UI | Tailwind CSS, shadcn/ui (Radix), Fraunces + Inter + JetBrains Mono (next/font), Lucide, Framer Motion |
| Data viz | React Flow + dagre (topology), Recharts (sparklines/trend) |
| Backend | Next Route Handlers, SSE streams, Prisma ORM |
| Database | Postgres — Neon (managed) or local via `docker compose` |
| Auth | NextAuth (credentials + optional GitHub + Google) |
| AI | OpenRouter (free tier; full heuristic fallback for streaming + JSON) |
| Email | Resend free tier (3,000/month) + React Email templates; Mailpit for local capture |
| Git | `simple-git` shallow clone with URL validation + size cap + timeout |
| Tests | Vitest (unit), Playwright (E2E) |

---

## Quickstart

### Option A — Neon (managed Postgres, no Docker)

```bash
npm install

# Create a Neon project at https://console.neon.tech, copy both URLs into .env
cp .env.example .env
#   DATABASE_URL  = pooled (PgBouncer)
#   DIRECT_URL    = direct (unpooled) — used by prisma db push + seed
#   NEXTAUTH_SECRET = openssl rand -hex 32

npm run prisma:generate
npm run prisma:push      # creates every table — uses DIRECT_URL
npm run prisma:seed      # demo user, 10 services, probes, rules, logs, 1 resolved incident

npm run dev              # → http://localhost:3000
```

### Option B — Local Postgres + Mailpit via Docker

```bash
docker compose up -d postgres mailpit
cp .env.example .env
# In .env, uncomment Option B's DATABASE_URL / DIRECT_URL lines.

npm install
npm run prisma:push
npm run prisma:seed
npm run dev
```

### Demo login

- **Email:** `demo@servicelens.com`
- **Password:** `demo123`

The seed creates one architecture — **E-Commerce Platform** — with 10 services, ~3,360 health records, 3 regression runs, 10 HTTP probes, 3 alert rules, 800 synthetic log entries, and 1 resolved historical incident with a four-event timeline.

---

## A guided tour

1. **Sign in** → land on the dashboard. The 88px editorial headline + atmospheric glow + topology hero are powered by `app/(dashboard)/dashboard/page.tsx`.
2. **Trigger incident** (header button on any architecture) →
3. Lands on the **incident detail** page. The **AI root-cause analysis** auto-streams via SSE — token-by-token from OpenRouter when `OPENROUTER_API_KEY` is set, else a heuristic fallback.
4. Click **Generate fix PR** → a second LLM pass produces a structured JSON `{ branchName, files[], prTitle, prBody }`. The diff renders per-file with color-coded hunks; **Copy as patch** + **Download .patch** are ready to `git apply`.
5. **Acknowledge** → **Resolve** with a note. The resolution is stored on the incident *and* indexed for the next incident's **runbook RAG-lite** prompt.
6. Open another tab on the same architecture's **Topology** view. Back in the first tab, hit **Alerts → Run now** under Chaos drills. The Payment service node pulses live in the topology tab via SSE — no polling.
7. Hit **⌘K** anywhere. Type "payment". Arrow keys + Enter to jump.
8. Press `g` then `d` to leader-key-navigate back to the dashboard.

---

## Free-tier dependency map

Every external service is optional. The app announces what's enabled in the **Settings** page and degrades cleanly when keys are missing.

| Dependency | Free tier | What turns on when configured |
|---|---|---|
| **Neon** (Postgres) | 0.5 GB storage, 191 compute-hours | Production-grade managed DB; otherwise use the included Docker Postgres |
| **OpenRouter** | Free model variants (`:free` suffix) | Real streamed RCA + fix-PR diff. Without it: heuristic fallback (still streams word-by-word) |
| **Resend** | 3,000 emails/month, 100/day | Real email notifications. Without it: console logging + in-app bell |
| **Slack webhooks** | Free | Per-architecture incident posting with Block Kit + magic-link ack button |
| **GitHub OAuth** | Free | "Continue with GitHub" on the login page |
| **Google OAuth** | Free | "Continue with Google" on the login page |
| **Vercel Cron** | Free tier (1 cron, 1 daily run on Hobby) | Triggers `/api/cron/tick` for chaos drills + job queue. Or run `npm run worker` |

---

## Environment

**Step-by-step "where do I get this value?" walkthrough lives in [`docs/env_get.md`](./docs/env_get.md).** The full reference is in `.env.example`. Highlights:

```bash
# Required
DATABASE_URL / DIRECT_URL
NEXTAUTH_SECRET

# Optional auth
GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

# Optional AI — comma-separated rotating pool (legacy singular still works)
OPENROUTER_API_KEYS="sk-or-aaa…,sk-or-bbb…,sk-or-ccc…"
OPENROUTER_MODEL   # defaults to a :free model

# Optional notifications
RESEND_API_KEY / RESEND_FROM
SLACK_WEBHOOK_URL  # per-architecture override available in the UI

# Optional ops
CRON_SECRET        # bearer guard on /api/cron/tick
WORKER_INTERVAL    # standalone `npm run worker` cadence (default 30s)
```

---

## Scripts

```bash
npm run dev              # next dev
npm run build            # prisma generate + next build
npm run start            # next start
npm run typecheck        # tsc --noEmit
npm run prisma:push      # db push (uses DIRECT_URL)
npm run prisma:seed      # tsx prisma/seed.ts
npm run db:reset         # force-reset + reseed
npm run worker           # standalone tick loop for self-hosting (drains Job queue + due chaos)
npm test                 # vitest run
npm run test:watch       # vitest --watch
npm run test:e2e         # playwright test (needs `npx playwright install chromium` once)
```

### Cron in production

Hook `GET /api/cron/tick` to a scheduler. See **[`docs/deploy_vercel.md`](./docs/deploy_vercel.md)** for the full Vercel deploy guide, including the four cron options (Vercel Cron, cron-job.org, GitHub Actions, self-hosted worker) and the two honest deployment caveats (SSE realtime needs Redis pub/sub for cross-instance fan-out; the Git analyzer expects a `git` binary at runtime).

The tick endpoint does two things every invocation: drains due `ChaosSchedule` rows + drains the `Job` queue. If you don't configure chaos schedules, you don't *strictly* need cron — manual "Run now" works without it.

Set `CRON_SECRET` and pass `Authorization: Bearer $CRON_SECRET`. A starter `vercel.json` is included.

For self-hosted deployments, `npm run worker` ticks at `WORKER_INTERVAL` seconds and does the same work.

---

## Testing

```bash
# Unit (Vitest) — 47 tests across 9 files
npm test
```

Coverage:
- `lib/code-analyzer.ts` (heuristic framework detection)
- `lib/topology-builder.ts` (graph + dependency derivation)
- `lib/health-monitor.ts` (simulate + real probe shape)
- `lib/alert-rules.ts` (every condition kind + describe strings)
- `lib/notify/tokens.ts` (JWT round-trip + tamper rejection)
- `lib/logs.ts` + `lib/log-generator.ts` (ingest + deterministic synthesis)
- `lib/rca.ts` + `lib/fix-pr.ts` (prompt assembly + JSON parser robustness)
- `lib/chaos.ts` (schedule grammar + isDue logic)
- `lib/membership.ts` + `lib/git-analyzer.ts` (role ranking + URL validator including SSRF guards)

```bash
# E2E (Playwright) — boots its own next dev on port 3100
npx playwright install chromium    # one-time
npm run prisma:seed                # E2E expects the seed
npm run test:e2e
```

E2E suites:
- `login.spec.ts` — credentials happy path + invalid creds toast.
- `incident-lifecycle.spec.ts` — trigger → wait for streamed RCA → generate fix PR → ack → resolve with note.
- `chaos-and-palette.spec.ts` — Run-now from Alerts; ⌘K palette + `g d` leader-key navigation.

`E2E_BASE_URL` skips the embedded `next dev` (useful for CI against a deployed preview).

---

## Database notes

- Neon's pooled URL must include `?sslmode=require&pgbouncer=true&connection_limit=1` — the template in `.env.example` already has this.
- `prisma db push` and the seed use `DIRECT_URL` (via the `directUrl` field in `schema.prisma`), so long-running DDL and bulk inserts don't go through PgBouncer.
- To wipe + reseed: `npm run db:reset`.
- JSON-shaped fields on `Service / RegressionRun / Probe / AlertRule / IncidentEvent / ChaosSchedule` are stored as `String` and decoded via `parseJson<T>()` — the schema has no Postgres-specific column types, so migrations stay boring.

---

## Architecture overview

See `docs/architecture.md` for a one-page module map. Highlights:

- **`lib/`** is the platform core. Every API route is a thin handler over a `lib/` module — easy to unit-test.
- **`lib/realtime.ts`** is an `EventEmitter`-backed pub/sub bus cached on `globalThis` so it survives Next.js HMR. Phase 7 swaps it for Redis pub/sub without changing callers.
- **`lib/jobs.ts`** is the in-process job queue. The interface (`enqueue`/`drain`/`registerHandler`) is stable so swapping to Inngest or BullMQ later is mechanical.
- **`lib/notify/`** uses a provider abstraction. Email is lazy-loaded (avoids dragging React Email's React peer into the App Router bundle).
- `app/api/cron/tick` is the single external entry point for batched background work — chaos drills + job drain.

---

## Implementation phases

See `implementation_plan.md` for the original eight-phase roadmap. All eight phases have shipped on this branch:

- **Phase 0** — foundations (rename hygiene, `simulated` flag, `Job` queue seam)
- **Phase 1** — real monitoring core (probes, alert rules, incident lifecycle, synthetic trigger)
- **Phase 2** — notifications (Resend email, Slack, in-app, magic-link ack)
- **Phase 3** — logs (ingest, search, SSE tail, snapshot-on-incident)
- **Phase 4** — AI SRE (streamed RCA, runbook RAG-lite, fix-PR generation)
- **Phase 5** — UI revamp on `DESIGN.md` + command palette + architecture template wizard
- **Phase 6** — realtime SSE + chaos drills + cron tick
- **Phase 7** — productionization (multi-user + audit + Git SSRF guards + Google SSO + Docker + worker)
- **Phase 8** — Playwright E2E + this README + `docs/architecture.md` + `CONTRIBUTING.md`

---

## License

Internal demo. Adapt freely.
