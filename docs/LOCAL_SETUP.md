# Local setup

Everything you need to run ServiceLens on your machine — database, environment variables, seed data, and day-to-day commands.

**Live demo:** [servicelens.buildlab.in](https://servicelens.buildlab.in)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ | LTS recommended |
| npm | 9+ | ships with Node |
| Docker | optional | only needed for local Postgres / Mailpit |
| git | optional | required if you use **Analyze** (repo cloning) |

---

## 1. Clone and install

```bash
git clone https://github.com/Abhishek-Mallick/ServiceLens.git
cd ServiceLens
npm install
```

---

## 2. Database

Pick one option.

### Option A — Neon (managed Postgres, no Docker)

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. Copy **Pooled** → `DATABASE_URL` and **Direct** → `DIRECT_URL` from Connection Details.
3. Ensure the pooled URL includes `?sslmode=require&pgbouncer=true&connection_limit=1`.

### Option B — Local Postgres via Docker

```bash
docker compose up -d postgres mailpit
```

In `.env`:

```bash
DATABASE_URL="postgresql://servicelens:servicelens@localhost:5432/servicelens?sslmode=disable"
DIRECT_URL="postgresql://servicelens:servicelens@localhost:5432/servicelens?sslmode=disable"
```

Mailpit UI is at [http://localhost:8025](http://localhost:8025) when you need to inspect outbound email locally.

---

## 3. Environment

```bash
cp .env.example .env
```

**Required** to boot the app:

```bash
DATABASE_URL=...          # pooled connection
DIRECT_URL=...            # direct connection (schema push + seed)
NEXTAUTH_SECRET=...       # openssl rand -hex 32
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Everything else — OpenRouter, OAuth, Resend, Slack, cron — is optional. The platform degrades gracefully when keys are missing (heuristic RCA, console notifications, credentials-only auth).

For a step-by-step walkthrough of every variable, see **[`env_get.md`](./env_get.md)**.

---

## 4. Initialize the database

```bash
npm run prisma:generate
npm run prisma:push      # uses DIRECT_URL
npm run prisma:seed      # demo user, E-Commerce architecture, probes, rules, logs
```

To wipe and reseed:

```bash
npm run db:reset
```

---

## 5. Run the app

```bash
npm run dev    # → http://localhost:3000
```

### Demo login

| Field | Value |
|---|---|
| Email | `demo@servicelens.com` |
| Password | `demo123` |

The seed creates **E-Commerce Platform** — 10 services, health history, HTTP probes, alert rules, synthetic logs, and one resolved historical incident.

---

## Commands reference

```bash
npm run dev              # development server
npm run build            # prisma generate + production build
npm run start            # serve production build
npm run typecheck        # tsc --noEmit

npm run prisma:generate  # regenerate Prisma client
npm run prisma:push      # apply schema (DIRECT_URL)
npm run prisma:seed      # load demo data
npm run db:reset         # force-reset schema + reseed
npm run db:migrate-demo  # one-off: flag a pre-existing seeded mesh as demo (see below)

npm run worker           # standalone monitoring scheduler (use with SCHEDULER=off on the web tier)
```

---

## Monitoring scheduler

Probes, alert rules, incidents, demo chaos drills and the job queue are all driven by one scheduler tick (`lib/scheduler.ts`). Nothing depends on a browser being open.

| Environment | How it runs |
|---|---|
| `npm run dev` / `npm start` | In-process, every `SCHEDULER_INTERVAL` seconds (default 15). Starts from `instrumentation.ts` |
| Separate worker | `npm run worker` on any always-on host, with `SCHEDULER=off` on the web tier |
| Vercel / serverless | A cron calling `GET /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`. `.github/workflows/scheduler-tick.yml` does this every 5 min (set the `SERVICELENS_URL` and `CRON_SECRET` repo secrets) |

Each probe runs on its own `intervalSec` (60s for the default probe) no matter how often the scheduler ticks.

## Paging and on-call

When an incident opens on a real architecture, a durable `incident_opened` job:

1. Looks up the on-call engineer in the architecture's **on-call directory** (Alerts → On-call directory). This is a Google Sheet published as CSV with the columns `service_name, oncall_name, oncall_email, escalation_email`; a `*` row covers every service without its own row.
2. Notifies everyone. All members get in-app alerts. Owners and editors get email when the rule enables it. The on-call engineer is always emailed, even without a ServiceLens account.
3. Schedules an escalation to `escalation_email` if nobody acknowledges within the configured minutes.
4. Generates the RCA in the background, so it's ready when someone opens the incident.

Email needs `RESEND_API_KEY`. Magic links in emails open a confirmation page first, because mail scanners prefetch links; the **Acknowledge** button there performs the ack.

Local testing against services on your machine: set `ALLOW_PRIVATE_PROBES=1`. Otherwise probes and sheet URLs pointing at private addresses are refused.

## Demo vs real architectures

The seeded **E-Commerce Platform** is flagged `demo`. Only demo architectures get simulated health, chaos drills, synthetic incidents and logs, and simulated regression runs. Architectures you create show only data from real probes, log ingest and repos. The API refuses the simulated features on them with `code: "demo_only"`.

If your database was seeded before this flag existed, run `npm run prisma:push && npm run db:migrate-demo` once. It flags the seeded mesh as demo, deletes its placeholder `example.invalid` probes, and gives every existing user read-only access to it (new signups get this automatically). Without that step the scheduler would really probe those fake hosts and page you.

---

## Optional integrations (quick reference)

| Variable | Enables |
|---|---|
| `OPENROUTER_API_KEYS` | Streamed LLM root-cause analysis + fix-PR generation |
| `GITHUB_CLIENT_ID` / `SECRET` | Sign in with GitHub |
| `GOOGLE_CLIENT_ID` / `SECRET` | Sign in with Google |
| `RESEND_API_KEY` / `RESEND_FROM` | Email incident notifications |
| `SLACK_WEBHOOK_URL` | Slack incident posts (per-architecture override in UI) |
| `GITHUB_APP_*` | Open a real draft PR from the fix-PR flow |
| `CRON_SECRET` | Bearer guard on `/api/cron/tick` |

Full setup instructions: **[`env_get.md`](./env_get.md)**.

---

## Troubleshooting

**`prisma db push` fails on Neon** — confirm `DIRECT_URL` is the unpooled connection string, not the pooler URL.

**RCA shows heuristic text instead of LLM output** — set `OPENROUTER_API_KEYS` (comma-separated pool supported). The app falls back when keys are absent or rate-limited.

**Analyze / clone fails** — ensure `git` is installed and reachable from the shell running Next.js.

**SSE events don't cross browser tabs on Vercel** — expected on multi-instance serverless; see realtime notes in **[`deploy_vercel.md`](./deploy_vercel.md)**.
