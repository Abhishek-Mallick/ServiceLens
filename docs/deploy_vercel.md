# Deploying ServiceLens on Vercel

ServiceLens is a stock Next.js 14 App Router app, so the happy path is trivial. There are **two genuine caveats** to know about; both have workarounds.

---

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
| Cron drills + job queue | ✅ via Vercel Cron or cron-job.org | See "Cron" below |
| Git analyzer (clone + analyze) | ⚠ Limited | See "Git analyzer" below |
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

After the first deploy, run the schema push once locally targeting your prod DB:
```bash
DATABASE_URL=$PROD_DATABASE_URL DIRECT_URL=$PROD_DIRECT_URL \
  npx prisma db push
# optionally:
DATABASE_URL=$PROD_DATABASE_URL DIRECT_URL=$PROD_DIRECT_URL \
  npm run prisma:seed
```

---

## 2. Cron — what it does and how to wire it

### What `/api/cron/tick` does

Every invocation runs two things:

1. **`runDueSchedules()`** — looks at every enabled `ChaosSchedule`, parses its `schedule` grammar (`every 5m` / `every 1h` / `14:00` UTC daily), and fires the action (`kill_service` / `degrade` / `latency_spike`) on the target service for any schedule whose interval has elapsed since `lastRunAt`. Each fire writes a HealthRecord, may open a critical incident (which triggers the notification + RCA pipeline), and updates `lastRunAt`.

2. **`drain()`** — pulls due `Job` rows from the queue and runs registered handlers (currently the seam from Phase 0; Phase 4's RCA generation is request-driven so the queue is empty in stock setups).

**If you don't configure chaos schedules, you don't strictly need cron.** The "Run now" button in the Alerts → Chaos panel works without cron. Cron is only required for *recurring* drills.

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

### Option C — GitHub Actions

```yaml
# .github/workflows/cron.yml
on:
  schedule:
    - cron: '*/5 * * * *'
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
               https://your-app.vercel.app/api/cron/tick
```

### Option D — Self-hosted (no cron service)

Run the standalone worker on any always-on box (Fly.io, Railway, your homelab):
```bash
WORKER_INTERVAL=30 npm run worker
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

## 4. Git analyzer — the second honest limitation

`lib/git-analyzer.ts` uses `simple-git`, which **shells out to the `git` binary**. Vercel's Node runtime doesn't include `git` by default.

**What this affects:** the "Analyze service from Git repo" path (`POST /api/architectures/:id/analyze`). Every other feature — incidents, RCA, fix-PR, chaos, notifications, topology rendering — uses *stored* data and works perfectly without `git`.

### Workarounds

- **Option 1 (recommended for demos):** disable the analyze button in production, or seed your demo architectures with the existing static seed (`npm run prisma:seed`). The 10 seeded services already have full analysis populated.
- **Option 2:** run the analyzer off-Vercel — a tiny worker on Fly.io or Railway calls `cloneShallow` + `extractKeyFiles` + writes to the same Postgres. The route just hands off a job.
- **Option 3:** add `git` to the Vercel build with a custom `vercel.json` install command. Hacky and not officially supported — works today but might break on Vercel runtime upgrades:
  ```json
  { "installCommand": "yum install -y git && npm install" }
  ```
  (Amazon Linux 2 / runtimes change; double-check the base image.)

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
- [ ] `prisma db push` against the prod `DIRECT_URL` once.
- [ ] (Optional) `prisma:seed` if you want the demo data live.
- [ ] Add OAuth callback URLs for GitHub / Google to point at `https://your-app/api/auth/callback/{github,google}`.
- [ ] Decide on cron: Vercel Cron (`vercel.json`) **or** cron-job.org pointing at `/api/cron/tick` + `Authorization: Bearer $CRON_SECRET`.
- [ ] Re-deploy. Verify `/api/cron/tick` returns 200 with the bearer header.
- [ ] Either accept SSE-on-serverless's "polling fallback" semantics, **or** wire Upstash Redis pub/sub for true realtime.
- [ ] Either disable the analyze button or run the analyzer off-Vercel.

That's it. Free-tier Neon + free-tier Vercel + free-tier OpenRouter + free cron-job.org = a fully functional ServiceLens deployment with $0/month spend.
