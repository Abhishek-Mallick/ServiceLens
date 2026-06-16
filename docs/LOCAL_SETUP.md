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

npm run worker           # standalone background tick (chaos schedules + job queue)
```

---

## Background work (chaos drills + job queue)

Chaos schedules and the job queue are drained by **`GET /api/cron/tick`**.

| Environment | How to run it |
|---|---|
| Local / self-hosted | `npm run worker` (default 30s interval via `WORKER_INTERVAL`) |
| Vercel / cloud | External cron hitting `/api/cron/tick` with `Authorization: Bearer $CRON_SECRET` |

Manual **Run now** on chaos drills works without cron. See **[`deploy_vercel.md`](./deploy_vercel.md)** for production scheduler options and deployment caveats.

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
