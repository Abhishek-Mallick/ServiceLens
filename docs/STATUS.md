# ServiceLens — Status & Book of Work

> Source of truth for what is **real**, what is **mocked**, and what is **left** to reach the product goal.
> Last updated 2026-09-13 (Chunks 1–6 landed; v1.0 definition of done met — see [§4](#4-definition-of-done-v1-golden-path) and the [Progress log](#5-progress-log)). Plan-level done/left view: [`implementation_plan.md` §A](./implementation_plan.md#a-progress-summary--done-vs-left). Update this file in the same PR that changes a line item.

**Product goal:** a company onboards its whole topology. Every microservice registers itself on ServiceLens, which then becomes the one place to monitor the health of every app and datastore. When something breaks, ServiceLens opens the incident, pages the right on-call, runs the RCA, and raises a fix PR on its own.

**Product rule:** simulated data is allowed **only** on the seeded demo architecture (`Architecture.demo = true`), which shows new users what the platform does. Every architecture a user creates shows only real data from real repos, real probes and real log ingest. Any simulated feature must be refused on real architectures (`lib/demo.ts`, API `code: "demo_only"`).

**Where we are:** a team can now onboard its services, and ServiceLens watches them and pages the right person with no one driving it. A user registers GitHub repos with deployed URLs, and ServiceLens maps the dependencies from source code. It health-checks each service server-side (with SSRF protection) and opens incidents on failure. It then pages the on-call engineer from the team's sheet and escalates if nobody acknowledges. The RCA is generated in the background, and incidents auto-resolve on recovery. Teams can share architectures with roles. Services can register themselves over an API (CI or agents via `/SKILL.md`), and private services report health by heartbeat. When something breaks, ServiceLens opens a **draft fix PR generated from the service's real source**, manually or automatically. ServiceLens also checks databases and caches, and runs contract tests against deployed services on every deploy or on a schedule. It shows what analysis couldn't resolve so people can fix the topology. Credentials are encrypted at rest. The architecture home is a live topology workspace, every screen follows `DESIGN.md`, and CI runs the whole golden path end to end against local fakes. **Not in v1.0** (tracked as P1 below, for v1.1): metrics ingest, more language extractors, an organization layer and email invites, scheduled on-call rotations, a webhook channel, multi-instance realtime/queue.

Legend: ✅ real & wired · 🟡 partial · 🔴 mocked or missing · `P0` blocks the golden path · `P1` next release (v1.1) · `P2` later. v1.0 = the golden path in §4 plus the definition of done in `implementation_plan.md`.

---

## 1. Snapshot

| Subsystem | State | Reality |
|---|---|---|
| Auth (credentials, GitHub/Google OAuth) | ✅ | `lib/auth.ts` |
| Onboarding (wizard, add/edit/delete service) | ✅ | `lib/onboarding.ts`. Validates GitHub URL and deployed URL, rejects duplicate names, auto-analyzes each new service. No fake template services |
| Repo ingestion | ✅ | GitHub API for the tree (2 calls/service), `raw.githubusercontent.com` for files, pinned to commit SHA, falls back to the default branch. Private repos via the GitHub App's installation token (or `GITHUB_TOKEN`). **Express/Next only** |
| Topology derivation | ✅ | `lib/topology/from-contracts.ts`: host match → env-name match → ambiguous (dashed) → unresolved; human decisions (`EdgeOverride`) survive re-analysis; dependency review UI |
| Health probes (HTTP/TCP) | ✅ | Server-side scheduler (`lib/scheduler.ts`). Default probe on `deployedUrl + healthPath` every 60s. SSRF-guarded at DNS-resolution time (`lib/net-guard.ts`). Browser only reads |
| Simulator | ✅ fenced | Runs only on demo architectures. Real services without a URL stay `unknown` with zero fake rows |
| DB / broker health | 🟡 | **Postgres** (`SELECT 1`) and **Redis** (`AUTH`+`PING`) probes, connection strings encrypted. MySQL, Mongo, Kafka and metrics not yet |
| Alert rules engine | ✅ | Prometheus-style `for` semantics (`decide()` in `lib/alert-rules.ts`). 3 default rules seeded per real architecture |
| Incident lifecycle | ✅ | Open/ack/assign/comment/resolve, dedup, log snapshot. Auto-resolve now publishes and notifies |
| Notifications | ✅ | In-app to all members; email to owners/editors (each person's prefs apply) plus the on-call engineer; Slack. Delivered as durable jobs. `webhook` channel not implemented |
| On-call directory / paging | ✅ | Google Sheet CSV (`lib/oncall/roster.ts`), per-service + `*` fallback, time-based escalation, magic-link ack for non-users (confirm page + POST, safe for link scanners) |
| Logs (HEC ingest, search, tail) | ✅ | Synthetic generation is demo-only |
| AI RCA | ✅ | Auto-generated as an `rca` job when an incident opens (real architectures); the incident page waits for it instead of starting a duplicate. Heuristic fallback without an LLM |
| Fix PR | ✅ | `lib/fix-pr.ts` + `lib/remediation.ts`: real source files at a pinned SHA, full-file model output, server-computed diff, draft PR via the GitHub App, conflict check, 1 PR/repo/hour, PR state sync, optional auto mode. Never faked, never merged |
| Regression testing | ✅ | **Contract tests**: every parameter-free GET route from the code called on the deployed URL (catches deploy drift, 5xx); manual, scheduled, or as a CI gate (`POST /api/v1/contract-tests`). Demo keeps its simulated engine |
| Chaos drills | 🔴 fenced | Writes fake health rows, now demo-only. No real fault injection |
| Job queue | ✅ | `probe`, `analyze`, `incident_opened`, `notify`, `escalate`, `rca`, `fix_pr`. `kick()` = durable enqueue + immediate in-process run; handlers self-register in fresh serverless processes |
| Scheduler | ✅ | In-process (`instrumentation.ts`), `npm run worker`, or `GET /api/cron/tick`. GitHub Actions pinger bundled for Vercel |
| Realtime (SSE) | 🟡 | Single instance only. Health page uses SSE plus a 60s fallback read; the bell still polls |
| Multi-user / RBAC | ✅ | Reads via `visibleTo()` (creator or member); every write checks editor/owner; enforced by `tests/authz-guard.test.ts`. Every new user gets read-only access to the demo |
| Audit log | ✅ | Now also records service add/update/delete/analyze |
| Programmatic onboarding (API keys / SKILL.md) | ✅ | Architecture API keys (hashed), `/api/v1` (upsert-by-name, list, delete, incidents, heartbeat), `/SKILL.md` served publicly |
| Architecture workspace | ✅ | The architecture home is the live topology: status/incident overlays, filters and search, a service drawer (uptime, p95, check history, probes, dependencies, logs, incident, on-call), an edge drawer (env var, code link, confirm/reject), and a rail (open incidents, on-call, activity) |
| Design system (`DESIGN.md`) | ✅ | `lib/design-tokens.ts` is the single source (parity test against DESIGN.md). Tailwind's palette is *replaced* by the tokens, so a non-token color class renders nothing. **Every screen is token-only**, with no box shadows, enforced by a lint test over `app/`, `components/`, `lib/` and `globals.css`. Charts, emails, Slack and the ack page read the tokens too |
| Public-endpoint rate limits | ✅ | `lib/rate-limit.ts`: log ingest 600/min per service, v1 API 120/min per key, magic-link ack 30/min per IP, sign-up 5/10 min per IP; `429` + `Retry-After`. Per instance (shared limits need Redis) |
| Runbook memory | ✅ | Human resolution notes, or an auto-recorded facts-only summary (`lib/runbook.ts`, `resolution_summary` job) when an incident resolves without a note |

---

## 2. Known bugs

- [x] **B1** — `/analyze` crashed once services had outbound deps. Fixed: topology is now built from contracts.
- [x] **B2** — Probes only ran while a browser tab was open. Fixed: server-side scheduler.
- [x] **B3** — Auto-resolve was silent. Fixed: it now publishes `incident_resolved` and sends `IncidentResolved`.
- [x] **B4** — Owner-only authz in 33 route/page files. Fixed: `visibleTo()` for reads, role checks on every write, guarded by a static test. The same sweep found and fixed probe, alert-rule and chaos-schedule mutations that only checked for the owner, and writes that any viewer could make.
- [x] **B5** — Services flip-flopped between real and simulated data. Fixed: the simulator, chaos and synthetic features are confined to demo architectures.
- [x] **B6** — Dead code removed: `lib/git-analyzer.ts`, `lib/code-analyzer.ts` (+ its test), the analysis half of `lib/openrouter.ts` (only `isAIEnabled` remains), and the `simple-git` dependency.
- [x] **B7 (security)** — SSRF via probes, deployed URLs and the Slack webhook. Fixed: `lib/net-guard.ts` checks in the DNS `lookup` hook, so DNS rebinding and redirects are covered, and checks IP literals separately. Adds a hard response deadline, a body cap, an `https://hooks.slack.com` allow-list, and validation at save time. `ALLOW_PRIVATE_PROBES=1` for self-hosting. `cmd`/`ping` probe types can no longer be created.
- [x] **B8** — Fix-PR returned 500 without an LLM, and when keys were missing or rate-limited `chatOnce` silently returned a canned `README.md` "fix" (which would have become a junk PR). Fixed: `strict` mode throws `AiUnavailableError` → 503 with a clear message. The demo explains that fixes need a real repo.
- [x] **B9** — One outage opened an incident per firing rule and paged twice. Fixed: one open incident per service; other firing rules attach as `related_alert` and can raise severity. (Cross-service correlation remains P2.)
- [x] **B10 (security)** — Magic-link ack was a state-changing GET, so email link scanners could acknowledge incidents unseen. Fixed: GET renders a confirmation page and POST acknowledges.
- [x] **B11** — A blank `OPENROUTER_API_KEYS` (common on Vercel) silently disabled AI even with a valid `OPENROUTER_API_KEY`: `KEYS ?? KEY` treated `""` as configured, so RCAs fell back to the heuristic report and fix PRs refused to run. Found by the golden-path E2E. Fixed: both variables are read, blanks ignored, duplicates merged (`parseKeys`, unit-tested).
- [x] **B13 (prod outage, 2026-09-14)** — A deploy shipped code reading `Incident.resolutionSummary` before the column existed in Neon, so the dashboard failed with `P2022`. The schema push was a manual step and got skipped. Fixed: the column was pushed. Production builds now run `prisma db push` before `next build` (`scripts/vercel-build.cjs`), with non-destructive changes only and previews skipped, so code and schema ship together.
- [x] **B12** — After sign-up, a failed automatic sign-in still sent the user to `/dashboard`, which bounced to `/login` with no explanation; the login page did the same when the auth route didn't answer. Fixed: both pages check the sign-in result ("Account created. Sign in to continue." / "Could not reach the server"). The E2E helper now waits for a real session rather than a URL, which removes the long-standing cold-start `/login` flake.

---

## 3. Book of work

Order matters: each workstream feeds the next. Spec references point to `docs/superpowers/specs/2026-05-22-real-mesh-design.md`.

### 3.1 Onboarding & topology (SP1 → SP2)
- [x] Schema: `Service.deployedUrl`, `healthPath`, `provider`, `ServiceContract`, `Architecture.demo`
- [x] GitHub ingestion + endpoint/dep extractors + fixture tests (`lib/ingest/*`)
- [x] Rate-limit-safe ingestion: 2 API calls per service, file bodies from the raw CDN at the commit SHA, parallel reads, default-branch fallback (stored on `Service.branch`), `GITHUB_TOKEN` for private repos
- [x] `lib/topology/from-contracts.ts` + `deriveContractTopology()`. Re-derived on analyze, rename, deployed-URL change and delete (fixes B1)
- [x] Onboarding wizard (`/architectures/new`): multi-service rows, name inferred from the repo, create → register → analyze. Removed the fake `your-org/*` templates
- [x] Add-service dialog with deployed URL + health path; analyzes the new service immediately
- [x] `GET/PATCH/DELETE /api/services/:id`
- [x] **Analysis results in the UI:** Repository analysis card (endpoints and dependencies with links to the exact lines, analysis errors, GitHub coverage); **dependency review** (ambiguous → pick one, unmatched → link or mark external, manual edges, undo) persisted as `EdgeOverride` and applied on every derivation; dashed ambiguous edges on the graph
- [x] Service settings card: edit name, repo, branch, deployed URL and health path; re-analyze; delete (two-step)
- [x] **Self-registration:** architecture API keys (`ApiKey`, SHA-256, shown once, revocable, 120 req/min/key); `GET /api/v1/architecture`, `GET /api/v1/services`, `PUT|GET|DELETE /api/v1/services/{name}` (idempotent upsert, analysis queued), `GET /api/v1/incidents`; API keys panel on the Services page; `public/SKILL.md` served at `/SKILL.md`
- [ ] `P1` Extractors beyond Express/Next: Fastify, NestJS, Spring, FastAPI/Flask, Go `net/http`/gin. Detect Kafka, DB and Redis from config
- [ ] `P1` Re-analyze on push (GitHub webhook) or on a schedule; flag `commitSha` drift
- [ ] `P1` Bulk onboarding: import a topology from YAML/JSON, or every repo in a GitHub org with a chosen topic
- [ ] `P2` Bitbucket / GitLab providers

### 3.2 Always-on monitoring engine (SP3)
- [x] Scheduler with atomic probe claiming (compare-and-set on `lastRunAt`), concurrency limit and overlap guard (`lib/scheduler.ts`)
- [x] Drivers: in-process loop via `instrumentation.ts`, `npm run worker`, `/api/cron/tick`, `.github/workflows/scheduler-tick.yml`
- [x] Job handlers registered (`lib/job-handlers.ts`): `probe`, `analyze`
- [x] Default probe on `${deployedUrl}${healthPath}` (60s); retargeted or removed as the URL changes
- [x] Default rules per real architecture: `Service down` (3 consecutive failures), `High latency` (>2s for 3 min), `Elevated error rate` (>20% for 2 min). Timing tests in `tests/default-rules.test.ts`
- [x] Simulator only on demo architectures (fixes B5)
- [x] Health page no longer drives probes (SSE + 60s read; "Probe now" is explicit)
- [x] SSRF guard on probe targets, deployed URLs, sheet URLs and Slack (B7)
- [x] Datastore probes: **Postgres** (`pg`, TLS modes incl. `prefer` fallback, SNI for managed providers) and **Redis** (RESP `AUTH`+`PING`, `rediss://`), dialled at a guard-resolved IP; errors never echo passwords
- [ ] `P1` MySQL, Mongo, Kafka metadata checks
- [x] Heartbeat / push-mode health: `POST /api/v1/services/{name}/heartbeat` creates a `heartbeat` probe; 2 missed intervals means down, then the normal rules and paging apply
- [ ] `P1` N-of-M / multi-location probing to avoid flapping
- [ ] `P1` Metrics ingest (OTLP / Prometheus remote-write); rules evaluated on metrics
- [ ] `P2` Retention/downsampling for `HealthRecord` and `LogEntry`; maintenance windows / silences
- [ ] `P2` Scheduler scale-out: it currently loads every enabled probe each tick. Add a `nextRunAt` index once probe counts reach the thousands

### 3.3 Incidents & paging (SP4)
- [x] Lifecycle, dedup, timeline, log snapshot, magic-link ack
- [x] Auto-resolve publishes and notifies (B3)
- [x] `OncallSource` + `IncidentOncallAssignment`; `lib/oncall/roster.ts` (CSV parser, validation with row errors, forgiving name match, `*` fallback, 5-min cache, stale-cache fallback); `lib/incident-pipeline.ts`
- [x] On-call directory UI (Alerts page): save & test, parsed roster table, "no one on call for …" warning; API `GET/PUT/DELETE /api/architectures/:id/oncall`, `POST …/oncall/refresh`
- [x] Fan-out: in-app to all members, email to owners/editors (per-user severity, quiet hours, opt-out) plus the on-call engineer; per-recipient magic-link tokens; on-call shown in email and on the incident page; the on-call becomes assignee if they're a member
- [x] Escalation to `escalation_email` after N min unacknowledged (`escalate` job, idempotent)
- [x] Demo isolation: demo incidents notify only its owner, never page on-call, and don't auto-run RCA
- [ ] `P1` Scheduled rotations (weekly on-call), not just a static sheet; PagerDuty/Opsgenie schedule import
- [ ] `P1` Generic outbound `webhook` channel; a `mitigated` transition in the UI
- [ ] `P2` Correlate co-firing rules and dependent-service incidents into one parent (B9); PagerDuty/Opsgenie; Slack interactive ack

### 3.4 AI SRE: RCA + remediation (SP5)
- [x] Context assembly, streaming RCA, heuristic fallback, fix-PR JSON + diff UI
- [x] Auto-run RCA as an `rca` job on incident open; the incident page polls for it instead of starting a duplicate; viewers read-only
- [x] GitHub App client (`lib/github/app.ts`): App JWT, per-repo installation lookup (no fixed installation id), token cache, PEM / `\n`-escaped / base64 keys, `GITHUB_API_URL` for GHES. (A per-org "Connect GitHub" install flow in the UI is still `P1`.)
- [x] Fix generation from real source: contract files ranked by RCA mentions, read at the branch HEAD SHA, model returns full file contents, diff computed with `diff`, validated (only given files, real change, no wholesale rewrite); model can answer "no code change"
- [x] `Remediation` model + `openFixPr`: blob → tree (modes preserved) → commit on HEAD → fresh `servicelens/incident-*` ref → draft PR (normal PR only where drafts aren't allowed); `FixPRReady` notification; timeline events; PR state sync (open/merged/closed)
- [x] Safety rails: draft only, never merge, only App-installed repos, 1 PR/repo/hour, idempotent per incident + 2-min lock, blob-SHA conflict check (no writes on conflict), demo never opens PRs, auto mode off by default per architecture
- [x] No fake fallback (B8). The patch always applies because we commit full contents onto the verified base blobs
- [x] PR status on the incident (synced)
- [x] In-app **Connect GitHub**: per-repo App coverage on the Services tab, install button with `state`, `/api/github/setup` callback back to the architecture
- [ ] `P1` Recent commits/deploys as RCA evidence; infra-suggestion cards when the model answers "no code change"
- [ ] `P2` Chat-with-incident

### 3.5 Regression & chaos (demo-only today)
- [x] Fenced to demo architectures (API + UI)
- [x] Real contract tests (`lib/contract-tests.ts`): plan with skip reasons, 2xx/3xx/401/403/429 pass, 404/405 = drift, 5xx/timeout fail; results as real `RegressionRun`s (so `regression_failed` rules work); Regression tab for real architectures; schedule (hourly / 6 h / daily) via the `contract_tests` job; CI endpoint
- [ ] `P2` Response-schema assertions and authenticated contract calls
- [ ] `P2` Real fault injection via an opt-in sidecar/flag endpoint; 5-field cron; drill report

### 3.6 Platform & multi-tenancy
- [x] Migrate owner-only checks to role helpers (B4) + static guard test
- [x] Demo architecture shared read-only with every user (signup, OAuth, `db:migrate-demo` backfill); "Read-only" badge, editor controls hidden for viewers
- [x] Role-aware UI everywhere: alert rules, probes, ingest token, incident ack/resolve, notification routing and "Probe now" are read-only for viewers (edit controls hidden; ingest token not fetched)
- [ ] `P1` Invite by email for people without an account (currently only existing users can be invited)
- [ ] `P1` **Organization / workspace** layer (API keys, GitHub installation, on-call source, members)
- [x] Encryption at rest (`lib/secrets.ts`, AES-256-GCM, `SECRETS_ENCRYPTION_KEY`): datastore connection strings, probe headers, Slack webhooks; API responses never include them (`publicProbe`, masked webhook); legacy plaintext still readable
- [ ] `P1` Redis pub/sub realtime for multi-instance deployments; move the bell to SSE
- [x] Rate-limit public endpoints: log ingest, v1 API, magic-link ack, sign-up (`lib/rate-limit.ts`, unit-tested)
- [ ] `P2` Inngest/BullMQ queue; Microsoft SSO; OTel for ServiceLens itself

### 3.7 UI
- [x] Topology-first architecture workspace (spec §8): one graph renderer (`components/workspace/mesh-graph.tsx`) for the workspace, dashboard preview and regression runner; the old `components/topology/*` stack was removed and `/topology` redirects
- [x] Dashboard "Onboard your own services" call-out until the user has a non-demo architecture; "Open workspace" replaces the old topology link. The "simulated" badge only renders for simulated rows, which exist only on the demo
- [x] `lib/design-tokens.ts` + Tailwind generated from it + token-only lint for the workspace
- [x] Every remaining screen migrated to token-only classes (codemod over 60 files, then the palette was replaced so legacy classes can't render); box shadows removed per DESIGN.md
- [ ] `P2` Lighthouse a11y ≥ 95 audit

### 3.8 Quality & docs
- [x] Unit: 29 files / 193 tests (+ runbook summary, rate limiter, OpenRouter key parsing, app-wide token lint), incl. topology + overrides, default-rule timing, authz guard, SSRF guard, secrets crypto, datastore probes (fake Redis), contract planning, roster, recipients, fix-PR diffing
- [x] Golden-path E2E on a real architecture against local fakes (`tests/e2e/golden-path.spec.ts`), in CI
- [x] E2E: fixed 3 pre-existing broken specs (selector drift, palette race); the lifecycle spec no longer depends on a live LLM (demo explains fix PRs need a real repo)
- [x] E2E 9/9 green (2026-09-12). The suite caught a real bug: the fix-PR button stayed disabled after the RCA streamed in (stale server prop). Fixed. The palette spec now searches instead of relying on the 5-item recent list
- [x] Docs: `LOCAL_SETUP.md` (scheduler, demo vs real), `deploy_vercel.md` (cron required, repo analysis), `.env.example` (`SCHEDULER*`, `GITHUB_TOKEN`)
- [x] `docs/secrets.md`: production secrets checklist (sources, Vercel setup, schema push, required cron). `.env.example` now marks variables the code doesn't read yet (`SLACK_WEBHOOK_URL`, `GITHUB_APP_*`, `REDIS_URL`)
- [ ] `P1` Tests for scheduler claiming and `analyzeArchitecture` against a test DB; E2E golden path with a toggleable stub service and MSW for OpenRouter/Resend/GitHub
- [x] CI workflow (`.github/workflows/ci.yml`): typecheck + unit on every push/PR; Playwright against a Postgres service with the seeded demo
- [x] README / `architecture.md` drift fixed: GitHub-API ingestion (no clone), contract tests, background RCA, the real fix-PR flow and safety rails, demo-only chaos, current module map

---

## 4. Definition of done: v1 golden path

This must pass end to end with no manual DB edits and no simulated data:

1. [x] Sign up → create architecture → install the GitHub App on the repos from the Services → GitHub card (the org layer is still P1)
2. [x] Register N services with `repoUrl` + `deployedUrl`, from the UI or via `curl`/`SKILL.md` with an API key
3. [x] Analyze → contracts extracted → **topology auto-derived** with correct edges
4. [x] Default probes and rules exist. Health updates **with no browser open**
5. [x] Paste the on-call CSV → roster renders
6. [x] Break a real service → `consecutive_down` trips → incident opens in under 3 min (measured: ~23s at a 5s probe interval; ~3 min at the 60s default)
7. [x] On-call gets an email (and Slack) → acks via magic link — verified with a non-user on-call; needs a real `RESEND_API_KEY` in prod
8. [x] RCA was already generated and persisted by the time they open the incident (logs are cited when the service ships logs via the ingest API)
9. [x] A **draft PR** exists on the affected repo, linked on the incident (auto mode, or one click)
10. [x] Service recovers → incident auto-resolves → resolution notification sent → runbook memory updated (facts-only "what happened" summary recorded automatically; a human note replaces it)

---

## 5. Progress log

### 2026-09-11 — Chunk 1: real onboarding → topology → always-on monitoring
**Shipped:** everything ticked in §3.1 and §3.2, plus B1, B2, B3 and B5 above. Main files: `lib/{scheduler,analyze,onboarding,demo,job-handlers}.ts`, `lib/topology/from-contracts.ts`, `lib/monitoring/defaults.ts`, `instrumentation.ts`, `scripts/migrate-demo.ts`, `.github/workflows/scheduler-tick.yml`.

**Verified end to end** on a scratch Postgres with a stub service: signup → onboard 2 real repos (`buildlab-devs/ecommerce-gateway`, `-product-service`) → edge `gateway → product-service` derived from `PRODUCT_SERVICE_URL`. The service without a URL stayed `unknown` with 0 fake rows. Taking the stub down opened an incident ~23s later, with a log snapshot and in-app notification. Bringing it back auto-resolved the incident ~7s later with a "Resolved" notification. All 5 simulated endpoints return `demo_only` on the real architecture. The demo mesh still simulates.

**Behaviour changes to know about:**
- Alert `forDuration` now means "continuously true for" (Prometheus semantics). The old check let a single slow probe page someone.
- Architecture templates are gone. New architectures start empty or with the services entered in the wizard.
- Architectures seeded before this change need a one-time `npm run prisma:push && npm run db:migrate-demo`. Otherwise the scheduler probes the seed's `example.invalid` placeholders and pages the owner.
- On Vercel, monitoring needs a cron (bundled GitHub Actions workflow, cron-job.org, or Pro cron).

**Next chunk:** B4 authz + B7 SSRF, then paging and auto-RCA — done in Chunk 2 below.

### 2026-09-11 — Chunk 2: multi-user authz, SSRF guard, paging, auto-RCA
**Shipped:** B4, B7 and B10 fixed; everything ticked in §3.3 and §3.6 plus auto-RCA in §3.4. Main files: `lib/access.ts`, `lib/net-guard.ts`, `lib/oncall/{roster,keys}.ts`, `lib/incident-pipeline.ts`, `lib/jobs.ts` (`kick`), `lib/notify/index.ts` (`resolveRecipients`), `app/api/notify/ack/route.ts`, `app/api/architectures/[id]/oncall/*`, `components/alerts/oncall-directory.tsx`.

**Verified end to end** on scratch Postgres with a stub service and stub sheet:
- **Authz:** non-member → 404; viewer can read the demo, but synthetic/delete/add-service → 404; invite + promote to editor works.
- **Paging:** the gateway went down and an incident opened. On-call *Olivia* (not a user) was matched from the sheet. In-app notifications went to both members, and email to owner, editor and Olivia. The RCA was saved 2s later. Escalation fired at +1 min to `lead@ext.test`.
- **Magic link:** GET left the incident `open` (scanner-safe). POST acknowledged it with `{"via":"magic-link","email":"olivia@ext.test"}` and sent the ack notice. A tampered token gets 400.
- **Recovery:** auto-resolved with a resolution email to all three. Demo incidents in the same window created 0 RCA/escalation jobs and 0 notifications to shared users.
- **Tests:** unit 125/125. E2E: all pass except the lifecycle fix-PR step when no LLM is available (B8).

**Behaviour changes to know about:**
- **Probes to private/internal addresses are now refused by default.** Self-hosters monitoring internal services must set `ALLOW_PRIVATE_PROBES=1`.
- Slack webhooks must be `https://hooks.slack.com/…`.
- Editors and owners now receive incident emails (previously only the owner). Each person's notification prefs apply.
- Rerun `npm run prisma:push && npm run db:migrate-demo` for the new tables and to give existing users demo access.

**Next chunk (recommended):** **Real fix PRs** (§3.4 P0: GitHub App, real source files in the prompt, `Remediation` + draft PR with safety rails, B8 503 + OpenRouter mock). Then **self-registration API + `SKILL.md`** (§3.1), which completes golden-path steps 1, 2 and 9.

### 2026-09-12 — Chunk 3: real fix PRs, self-registration API, heartbeats, B8/B9
**Shipped:** everything newly ticked in §3.1, §3.2 and §3.4, plus B8 and B9. Main files:
- `lib/github/app.ts`, `lib/fix-pr.ts` (rewritten), `lib/remediation.ts`, `lib/api-keys.ts`, `lib/v1.ts`
- `app/api/v1/**`, `app/api/incidents/[id]/fix-pr/open`, `app/api/architectures/[id]/api-keys/**`
- `components/incidents/fix-pr-panel.tsx`, `components/alerts/fix-pr-settings.tsx`, `components/architecture/api-keys-panel.tsx`
- `public/SKILL.md`, `docs/USER_GUIDE.md`

**Verified end to end** on scratch Postgres against a local fake GitHub + OpenAI-compatible LLM (`GITHUB_API_URL` / `OPENROUTER_BASE_URL`), so no real repos were written to:
- **v1 API:** a key authenticates (a bad key gets 401), and the key is stored hashed only. `PUT` registers `orders` (201); a repeat `PUT` updates it (200, still 1 row). Analysis ran through the App installation token (2 endpoints, 1 dependency). Invalid input comes back as a structured 400.
- **Heartbeat:** the probe is created on the first beat; the service went **down** after beats stopped.
- **Auto mode golden path:** outage → incident → on-call paged → RCA → fix generated from `src/clients/payments.js` (timeout 500 → 3000) → PR opened.
- **Exact GitHub writes:** 1 blob, a tree on `base_tree` with a `100644` entry, a commit whose parent is `main`'s HEAD, a `servicelens/…` ref, a `draft: true` PR with the "never merges" footer. `FixPRReady` went to members.
- **Idempotency:** a second click returned the same PR with 0 new writes.
- **PR state sync:** merged on GitHub → the incident shows `merged` + a `fix_pr_merged` event.
- **Safety:** a second PR on the same repo within the hour → **429**; a file changed upstream → **409 conflict, 0 writes**; a repo without the App → failed with a clear message.
- **B9:** 3 broken services → exactly 3 incidents, each with the second rule attached as `related_alert`.
- **UI:** the incident, Alerts and Services pages render the new panels; `/SKILL.md` is public (`text/markdown`).
- Tests: **141/141 unit**, **9/9 E2E**, typecheck clean.

**Behaviour changes to know about:**
- Fix PRs now require the service to be analyzed (the contract picks the files) and a working LLM. Pick a capable `OPENROUTER_MODEL`: free models often can't return full files as valid JSON.
- Fixes are never faked. The old heuristic "README TODO" patch is gone from the fix path.
- **One incident per service at a time.** Additional firing rules attach to it.
- Rerun `npm run prisma:push` for the `Remediation` and `ApiKey` tables and the heartbeat fields.

**Next chunk (recommended):**
- Surface analysis results in the UI (unresolved/ambiguous edges, per-service analysis errors) and service settings
- Datastore probes (Postgres/Redis) with an encrypted secrets table
- Real contract-test regression runs against `deployedUrl`
- The in-app "Connect GitHub" flow

### 2026-09-13 — Chunk 4: analysis review UI, service settings, datastore checks, contract tests, encryption, Connect GitHub
**Shipped:**
- Main files: `lib/topology/{from-contracts,insights}.ts` (+ `EdgeOverride`), `lib/datastore-probes.ts`, `lib/secrets.ts`, `lib/contract-tests.ts`
- GitHub coverage + setup: `lib/github/app.ts`, `app/api/github/setup`
- Routes: `app/api/architectures/[id]/{edges,contract-tests}`, `app/api/v1/contract-tests`
- Components: `dependency-review`, `service-settings`, `analysis-card`, `github-panel`, `contract-tests-panel`
- `docs/implementation_plan.md` now has a done/left summary with honest per-item ticks

**Verified live** (scratch Postgres, fake GitHub/LLM, fake Redis, stub service; `SECRETS_ENCRYPTION_KEY` set):
- **Contract tests:** the plan called 7 GET routes and listed each skip with its reason (POST, `:id` params, no deployed URL). The run caught real drift: `orders GET /api/orders` → 404 "in the repo but not served", plus 4 gateway routes. `POST /api/v1/contract-tests` → `failed=5` + run URL. With a 60-minute schedule and a stale last run, **the scheduler started a run on its own**. Real runs show "Summary", not "AI summary".
- **Dependency review:** `PAYMENTS_SERVICE_URL` was unmatched → ambiguous once `payments-api`/`payments-worker` existed → confirmed `payments-worker` → edge persisted (`matchedBy: confirmed`) and **still there after re-analysis**. Undo made it ambiguous again. Ignore cleared it; a manual edge `ledger → orders` was persisted; a self-edge was rejected.
- **Datastore probes:** Postgres `SELECT 1` against real Postgres → healthy (3 ms). A missing database → `database "nope_db" does not exist`. Redis with the right password → healthy; the wrong one → `WRONGPASS`. An invalid scheme → 400. At rest, all 4 connection strings are `enc:v1:` with redacted targets and **0 plaintext passwords** in DB or API responses.
- **GitHub:** the Services tab shows coverage (`acme/orders` fix PRs enabled; the others "App not installed") and the install button. The setup callback redirects to the architecture (signed in), to `/login` (signed out) and to `/dashboard` (bad state), and the return banner renders.
- **Slack:** saved encrypted (`enc:v1:`), shown masked, secret not in page HTML; a non-Slack host → 400.
- **Tests:** 178/178 unit, 9/9 E2E, typecheck clean.

**Behaviour changes to know about:**
- **Set `SECRETS_ENCRYPTION_KEY`** (`openssl rand -hex 32`) before storing credentials, and don't change it later. Without it the key derives from `NEXTAUTH_SECRET`.
- `npm run prisma:push` again: `EdgeOverride`, `Probe.secret`, `Architecture.contractTestIntervalMin`.
- Existing Slack webhooks/probe headers keep working and get encrypted on their next save.
- The Regression tab on real architectures now runs contract tests instead of showing a placeholder.

**Next chunk (recommended):** CI workflow + MSW-mocked golden-path E2E, then the topology-first architecture page with the Phase 5 design tokens (see implementation_plan.md §"Suggested order for what's left").

### 2026-09-13 — Chunk 5: architecture workspace, design tokens, CI
**Shipped:**
- `lib/design-tokens.ts` with `tailwind.config.ts` generated from it
- `lib/workspace.ts` (+ types and filters)
- `app/api/architectures/[id]/workspace`, `app/api/services/[id]/overview`
- `components/workspace/*`: mesh graph, workspace shell, service drawer, edge drawer, rail, health bars, status dot
- The architecture home is now the workspace; `/topology` redirects
- The dashboard preview and regression runner use the same graph; `components/topology/*` deleted
- `.github/workflows/ci.yml`

**Verified live** (scratch Postgres, stub service):
- **Workspace API.** Acme returns 6 nodes and 2 edges with per-service uptime/p95/checks, 2 open incidents sorted by severity, on-call people (`Olivia Oncall → ecommerce-gateway`, `Acme SRE → 5 services`) and 30 activity items. The demo returns 27 nodes / 45 edges with on-call hidden. Unauthenticated → 401.
- **Service overview.** `orders` has 60-check history, the probe's last status, a hand-added `ledger` edge, the open incident, on-call, and `canEdit`.
- **UI (screenshots reviewed).**
  - Workspace graph with status dots, incident pills and env-var edge labels.
  - Service drawer: uptime 41.1%, p95 15 ms, check bars showing the outage window.
  - Edge drawer: `PRODUCT_SERVICE_URL`, GitHub line link, "matched automatically", "This match is wrong".
  - The demo shows the whole mesh.
- **E2E.** 12 specs incl. 4 new workspace tests (home, drawer + Escape, search → drawer, `/topology` redirect). Unit 188/188, typecheck clean.

**Found and fixed during verification:** opening at a clamped "readable" zoom cropped large meshes (the demo's API Gateway was off-canvas). The workspace now always opens on the whole mesh, and search/click zooms into a node.

**Known:**
- React Flow logs a dev-only warning #002 under StrictMode even though node/edge types are module constants.
- The first E2E test after a cold `next dev` start occasionally lands on /login; CI retries twice.

**Git:** the commit history rewrite to drop earlier `Co-Authored-By` trailers was blocked by the environment's permission guard. New commits carry no such trailer. See the hand-off in the chunk summary.

**Next chunk (recommended):** migrate the remaining screens to token-only classes (Phase 5.2–5.3) + an MSW-mocked golden-path E2E on a real architecture; then metrics ingest (OTLP). → Done in Chunk 6.

### 2026-09-13 — Chunk 6: v1.0 close-out (design system everywhere, golden-path E2E, runbook memory, hardening)
**Shipped:**
- **Design system everywhere.** A codemod rewrote 389 lines in 60 files from shadcn/HSL and Tailwind palette classes to `DESIGN.md` tokens. `tailwind.config.ts` now *replaces* Tailwind's palette with the tokens, so a stray class renders nothing. `globals.css` reads `theme()` tokens only; box shadows were removed. Charts, emails, Slack messages and the ack page import `lib/design-tokens.ts`, and toasts use the dark surfaces. The lint test covers `app/`, `components/`, `lib/` and `globals.css`.
- **Golden-path E2E on a real architecture** (`tests/e2e/golden-path.spec.ts`, fakes in `tests/e2e/fakes/server.cjs`, wired in `playwright.config.ts`): sign up → wizard → analysis at a pinned commit → server-side health checks → on-call sheet → outage → incident → on-call paged → RCA → auto draft PR (asserts the exact GitHub writes) → recovery → auto-resolve → runbook summary. GitHub, the GitHub App, the LLM and the service are local fakes; email and real tokens are blanked. Runs in CI; locally only with `E2E_GOLDEN=1` against a scratch DB.
- **Runbook memory without a human note:** `Incident.resolutionSummary` + `lib/runbook.ts` (`resolution_summary` job on auto-resolve or a note-less resolve). Facts only; shown on the incident as "What happened"; fed to future RCAs as auto-recorded, and a human note wins.
- **Hardening:** `lib/rate-limit.ts` on log ingest, the v1 API, magic-link ack and sign-up. Role-aware UI for rules, probes, ingest token, incident actions, notification routing and "Probe now". Dashboard onboarding call-out. The register page no longer strands a user on a protected page when the automatic sign-in fails. B6 dead code and `simple-git` removed. README / `architecture.md` drift fixed.

**Verified** (scratch Postgres, local fakes, no real GitHub/LLM/email):
- **Golden path** passes in ~57s: user signed up → `orders` onboarded from `acme/orders-<run>` at a pinned commit → healthy with no browser → outage → incident → on-call "Acme SRE" from the sheet → RCA from the (fake) model → draft PR #1 on a `servicelens/` branch, with exactly blob → tree → commit → ref → pull written → recovery → auto-resolve → summary: "Recovered after under a minute… Likely cause (RCA): Calls from orders to PAYMENTS_SERVICE_URL time out… Fix: PR #1 "fix(orders): raise payments client timeout to 3s" (open) …".
- **Full Playwright suite 13/13** (1.9 min), including the golden path. **Unit 193/193** (29 files), typecheck clean.
- The golden path found two real bugs (B11 AI keys, B12 sign-in result), both fixed above.

**Behaviour changes to know about:**
- `npm run prisma:push` for `Incident.resolutionSummary` (use the IP-override command if your network's DNS blocks Neon).
- Public endpoints can now return `429` with `Retry-After`.
- Viewers no longer see edit controls they can't use.
