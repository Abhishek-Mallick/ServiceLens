# Deploying ServiceLens on Vercel

ServiceLens is a stock Next.js 14 App Router app, so the happy path is trivial. There are **two genuine caveats** to know about; both have workarounds.

---

> Env vars and secrets: see **[`secrets.md`](./secrets.md)** for the full checklist.

## TL;DR

| Subsystem | On Vercel | Notes |
|---|---|---|
| Pages / API routes | ✅ Works out of the box | |
| NextAuth (creds + GitHub + Google) | ✅ | Set `NEXTAUTH_URL` to your prod URL |
| Postgres (Neon) | ✅ | Use the pooled `DATABASE_URL` |
| OpenRouter streaming RCA | ✅ | Free `:free` models tolerate Vercel's function timeout |
| Resend email | ✅ | |
| Slack webhooks | ✅ | |
| Live SSE bell / topology pulses | ⚠ Limited | See "Realtime" below |
| Monitoring scheduler (probes, rules, incidents) | ⚠ Needs an external cron | **Required.** See "Cron" below |
| Repo analysis (GitHub API) | ✅ | No `git` binary needed. See "Repo analysis" below |
| Docker compose | n/a | Vercel doesn't run your `docker-compose.yml` |

---

## 1. One-click deploy

```bash
# From the repo root
vercel             # follow the prompts; link or create a project
vercel env pull    # if you set env vars in the dashboard
vercel --prod      # ship to production
```

Set every value from `docs/env_get.md` in **Project Settings → Environment Variables** (or via `vercel env add`). Required at minimum:

- `DATABASE_URL`, `DIRECT_URL` (Neon pooled + direct)
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` = your prod URL (e.g. `https://servicelens.vercel.app`)
- `NEXT_PUBLIC_APP_URL` = same as `NEXTAUTH_URL`

The schema is applied by the build: production deploys run `npm run vercel-build`, which runs `prisma db push` (non-destructive changes only; a destructive one fails the build) before `next build`. Set `DIRECT_URL` for the Production environment. Preview deploys skip the push.

Optionally, load the demo mesh once from your machine:
```bash
DATABASE_URL=$PROD_DATABASE_URL DIRECT_URL=$PROD_DIRECT_URL \
  npm run prisma:seed
```

---

## 2. Cron — what it does and how to wire it

### What `/api/cron/tick` does

Every call runs one scheduler tick (`lib/scheduler.ts`):

1. **Due probes.** Every enabled probe whose `intervalSec` has elapsed runs for real. Results write `HealthRecord`s, which evaluate alert rules and open or auto-resolve incidents.
2. **Demo simulation.** Advances simulated health on demo architectures only.
3. **`runDueSchedules()`.** Fires due chaos drills (demo architectures only).
4. **`drain()`.** Runs pending `Job` rows (`probe`, `analyze`).

**Cron is required.** Vercel functions don't live between requests, so the in-process scheduler (`instrumentation.ts`) is skipped there. Without a cron nothing gets health-checked and no incidents open. Detection latency is roughly the cron cadence plus 3 probe intervals.

### Option A — Vercel Cron (cleanest, free tier OK)

The repo ships a `vercel.json` with a **once-daily** cron:

```json
{ "crons": [ { "path": "/api/cron/tick", "schedule": "0 9 * * *" } ] }
```

**Hobby tier limitation:** Vercel rejects sub-daily cron expressions on Hobby with `"Hobby accounts are limited to daily cron jobs"`. The shipped `0 9 * * *` (once a day at 09:00 UTC) deploys cleanly. **Pro** unlocks arbitrary cadence — bump it to `*/5 * * * *` for proper chaos-drill granularity.

**Recommendation for Hobby:** leave Vercel Cron as the daily heartbeat *and* add an external scheduler below for sub-daily cadence. Or skip Vercel Cron and use only Option B / C.

Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET` **if** `CRON_SECRET` is set in the project env. Set it.

### Option B — cron-job.org (works on any tier)

Free, generous, hits any URL on the schedule you set.

1. <https://cron-job.org> → sign up → **Create cronjob**.
2. **Title:** `servicelens-tick`.
3. **URL:** `https://your-app.vercel.app/api/cron/tick`
4. **Schedule:** every 5 minutes (or whatever).
5. **Advanced → Request method** = `GET`. **Request headers:**
   ```
   Authorization: Bearer <CRON_SECRET>
   ```
6. Save. Hit **Run now** once to confirm a 200.

### Option C — GitHub Actions (bundled)

The repo ships `.github/workflows/scheduler-tick.yml`, which calls `/api/cron/tick` every 5 minutes. Add two repository secrets:

- `SERVICELENS_URL`, e.g. `https://your-app.vercel.app`
- `CRON_SECRET`, the same value as the app's env var

It does nothing until `SERVICELENS_URL` is set. GitHub can delay scheduled runs by a few minutes under load; for tighter detection use Option B at 1 minute, or Option D.

### Option D — Self-hosted (no cron service)

Run the standalone worker on any always-on box (Fly.io, Railway, your homelab):
```bash
SCHEDULER_INTERVAL=15 npm run worker
```
Talks to the same Postgres your Vercel deployment uses. Drains the same queue.

---

## 3. Realtime SSE — the honest limitation

ServiceLens's live updates (live topology pulses, bell badge auto-refresh, health flips without polling) use an **in-process pub/sub bus** (`lib/realtime.ts`). On Vercel:

- The SSE endpoint `/api/architectures/:id/events` **works** — the subscriber receives events for its own function invocation.
- But Vercel's serverless functions are **independent processes**. A `publish()` from `/api/architectures/:id/chaos-now` (one invocation) can't reach a subscriber on `/api/architectures/:id/events` (a different invocation).
- Result: live cross-tab updates work *within* the same long-running function invocation but degrade to "polling" semantics across the platform.

**This doesn't break the app.** Manual refresh (the 30s polling fallback in HealthDashboard and NotificationBell, plus user-driven `router.refresh`) covers the same surfaces. You just lose the millisecond-feel.

### To restore real-time on Vercel — two paths

1. **Upstash Redis pub/sub** (free tier: 10k commands/day). Swap `lib/realtime.ts`'s `EventEmitter` for Redis `PUBLISH/SUBSCRIBE`. ~50 lines of code. The `publish()`/`subscribe()` interface stays.
2. **Pusher / Ably / Soketi** — managed WebSocket fan-out. Replace `useArchitectureEvents` hook to subscribe to their client SDK; backend posts via REST.

Both are deliberately deferred — see `implementation_plan.md` Phase 7.

---

## 4. Repo analysis

Analysis reads repos through the GitHub REST API plus `raw.githubusercontent.com`. It never runs `git clone`, so it works on Vercel as-is.

- **Public repos:** no setup needed. Each service costs 2 GitHub API calls, and the unauthenticated limit is 60/hour per server IP.
- **Private repos / larger meshes:** set `GITHUB_TOKEN` (a fine-grained token with read-only *Contents* access). That raises the limit to 5,000/hour.
- **Timeouts:** analysis runs inside the request. On Hobby (60s function limit), analyze large meshes in batches with `POST /api/architectures/:id/analyze {"serviceIds": [...]}` (new services are already analyzed one at a time when added), or run analysis from `npm run worker` via the `analyze` job.

---

## 5. Function timeout for the streaming RCA

The SSE `/api/incidents/:id/rca` route streams up to ~30 seconds in the worst case. Vercel limits:

- **Hobby:** 60s default, 60s max ➡ fine.
- **Pro:** 300s default, 300s max ➡ overkill.

We already set `export const maxDuration = 300` on the RCA + fix-PR routes. No tuning needed.

---

## 6. Build & runtime config

`next.config.js` already marks `simple-git`, `resend`, and `@react-email/*` as `serverComponentsExternalPackages` — required to prevent React Email from dragging a duplicate React tree into the App Router bundle.

Nothing else to configure.

---

## 7. Full deploy checklist

- [ ] `vercel link` or import the repo via the dashboard.
- [ ] Set every required env var (see `docs/env_get.md`).
- [ ] Set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the prod URL.
- [ ] `DIRECT_URL` set for Production (the production build applies the schema with it).
- [ ] (Optional) `prisma:seed` if you want the demo data live.
- [ ] Add OAuth callback URLs for GitHub / Google to point at `https://your-app/api/auth/callback/{github,google}`.
- [ ] Decide on cron: Vercel Cron (`vercel.json`) **or** cron-job.org pointing at `/api/cron/tick` + `Authorization: Bearer $CRON_SECRET`.
- [ ] Re-deploy. Verify `/api/cron/tick` returns 200 with the bearer header.
- [ ] Either accept SSE-on-serverless's "polling fallback" semantics, **or** wire Upstash Redis pub/sub for true realtime.
- [ ] Either disable the analyze button or run the analyzer off-Vercel.

That's it. Free-tier Neon + free-tier Vercel + free-tier OpenRouter + free cron-job.org = a fully functional ServiceLens deployment with $0/month spend.
