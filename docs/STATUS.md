# ServiceLens — Status & Book of Work

> Source of truth for what is **real**, what is **mocked**, and what is **left** to reach the product goal.
> Audited against code on branch `feat/sp1-github-contents-ingestion` (2026-09-10). Update this file in the same PR that changes a line item.

**Product goal:** a company onboards its whole topology. Every microservice registers itself on ServiceLens, which then becomes the one place to monitor the health of every app and datastore. When something breaks, ServiceLens opens the incident, pages the right on-call, runs the RCA, and raises a fix PR on its own.

**Where we are:** the parts are built. Models, UI, rules engine, incident lifecycle, RCA streaming, and notifications all exist and have tests (69 unit tests pass, `tsc` is clean). The problem is that **nothing runs on its own**. Probes only fire while someone has the Health page open, the job queue has no handlers, RCA and fix-PR only run when someone clicks, and a fix PR never reaches GitHub. So the platform behaves like a demo you drive by hand, not a monitoring system.

Legend: ✅ real & wired · 🟡 built but not wired / partial · 🔴 mocked or missing · `P0` blocks the golden path · `P1` needed for v1 · `P2` later

---

## 1. Snapshot

| Subsystem | State | Reality |
|---|---|---|
| Auth (credentials, GitHub/Google OAuth) | ✅ | `lib/auth.ts` |
| Architecture / service CRUD | ✅ | UI can't set `deployedUrl` (API accepts it) |
| Repo ingestion (GitHub Contents API) | 🟡 | Extractors are real. Calls are unauthenticated (60 req/hr), Express/Next only, and **results break topology** (see B1) |
| Topology derivation | 🔴 | `topology-builder.ts` still expects the old LLM `consumesApis` shape. SP2 (`from-contracts`) not started |
| Health probes (HTTP/TCP) | 🟡 | Real probe code, but **nothing schedules it**. It only runs from the browser (`health-dashboard.tsx` POSTs every 30s) |
| Simulator fallback | 🔴 | Any service without a probe gets `simulateHealth()` sine-wave data. Seed probes point at `example.invalid` |
| DB / broker health | 🔴 | Only a raw TCP connect. No query-level checks, no metrics |
| Alert rules engine | ✅ | DSL + evaluator + UI. No default rules get seeded |
| Incident lifecycle | ✅ | Open/ack/assign/comment/resolve, dedup, log snapshot. Auto-resolve skips the notify and realtime publish |
| Notifications | 🟡 | In-app, Slack, and Resend email are real. **Owner is the only recipient**; members and on-call are ignored. `webhook` channel is declared but not implemented |
| On-call directory / paging | 🔴 | SP4 not started |
| Logs (HEC ingest, search, tail) | ✅ | Synthetic generator is still the main data source in the demo |
| AI RCA | 🟡 | Streams and falls back correctly, but only runs manually. Not triggered when an incident opens |
| Fix PR | 🔴 | Only renders a diff in the UI. **No GitHub App, no branch/commit/PR code.** The LLM produces the patch without seeing the actual source files |
| Regression testing | 🔴 | `Math.random() < failureRate` (`lib/regression-engine.ts:121`) |
| Chaos drills | 🟡 | Writes fake `HealthRecord`s. Doesn't inject real faults; the next real probe overwrites it |
| Job queue | 🔴 | `lib/jobs.ts` works, but **0 `registerHandler` and 0 `enqueue` calls** in the codebase |
| Scheduler | 🔴 | `vercel.json` cron is `0 9 * * *` (once a day). There is no probe loop |
| Realtime (SSE) | 🟡 | Works on a single instance only. Health page and bell still poll |
| Multi-user / RBAC | 🟡 | Membership model and helpers exist, but **32 route files still check `userId === owner`**. Only 2 use roles |
| Audit log | ✅ | |
| Programmatic onboarding (API keys / SKILL.md) | 🔴 | Every API needs a browser session cookie |
| Design system (`DESIGN.md`) | 🟡 | Fonts are wired. No `lib/design-tokens.ts`, no token lint |

---

## 2. Known bugs (fix first)

- [ ] **B1 `P0` — `/analyze` crashes once services have outbound deps.** `lib/ingest/persist.ts` writes `consumesApis` as `string[]` (env var names). `lib/topology-builder.ts:117` reads `apiCall.service.toLowerCase()` on those strings, which throws. The architecture is then left stuck in `analyzing`. Fixing SP2 fixes this.
- [ ] **B2 `P0` — Probes only run while a browser tab is open.** Move probing to the scheduler (§3.2).
- [ ] **B3 `P1` — Auto-resolve is silent.** `resolveIncidentForRule` skips `publish()` and `notifyForIncident()`.
- [ ] **B4 `P1` — Owner-only authz everywhere.** Members get 404s. Swap the `findFirst({ userId })` checks for `requireOwnedArchitecture/Service/Incident` (`lib/auth-helpers.ts`).
- [ ] **B5 `P1` — Once a real probe exists, the service flip-flops between real and simulated data.** `recordHealth` overwrites `Service.simulated` on every write, and synthetic incidents or chaos write fake rows into a real series.
- [ ] **B6 `P2` — Dead code.** `lib/git-analyzer.ts` and `lib/openrouter.ts` analysis are orphaned after SP1. Delete them or fold them into LLM enrichment.

---

## 3. Book of work

Order matters: each workstream feeds the next. Spec references point to `docs/superpowers/specs/2026-05-22-real-mesh-design.md`.

### 3.1 Onboarding & topology (SP1 → SP2)
- [x] Schema: `Service.deployedUrl`, `provider`, `ServiceContract`
- [x] GitHub Contents client + endpoint/dep extractors + fixture tests (`lib/ingest/*`)
- [x] `/analyze` persists `ServiceContract`
- [ ] `P0` Add `deployedUrl` (and health path) fields to `components/architecture/add-service-button.tsx`
- [ ] `P0` `lib/topology/from-contracts.ts`: env-name match → deployed-URL match → ambiguous dashed edge. Replace the `buildTopology` call in `/analyze` (fixes B1)
- [ ] `P1` UI to confirm or reject ambiguous edges, and to add manual edges (writes `ServiceDependency`)
- [ ] `P1` Authenticated ingestion using a GitHub App installation token (see §3.6). Honour `Service.branch` and detect the default branch instead of assuming `main`
- [ ] `P1` Move analysis onto the job queue (`analyze` job) instead of a 300s request
- [ ] `P1` Re-analyze on push via a GitHub webhook, or on a schedule. Store `commitSha` drift
- [ ] `P1` Extractors beyond Express/Next: Fastify, NestJS, Spring (`@GetMapping`), FastAPI/Flask, Go `net/http`/gin. Also detect Kafka, DB, and Redis from config
- [ ] `P1` Bulk onboarding: import a topology from YAML/JSON, or a GitHub org (all repos with a chosen topic)
- [ ] `P1` **Self-registration API + `SKILL.md`:** per-org API keys (`ApiKey` model, hashed). Plus `POST /api/v1/services` (upsert by name) and `POST /api/v1/services/:id/heartbeat`. Ship `SKILL.md` with curl recipes so an agent or CI step can register a service
- [ ] `P2` Bitbucket / GitLab providers (currently shown as "coming soon")

### 3.2 Always-on monitoring engine (SP3)
- [ ] `P0` Register job handlers at boot (`probe`, `rca`, `fix_pr`, `notify`, `analyze`, `oncall_assign`, `remediation`). Today the queue does nothing
- [ ] `P0` Scheduler: each tick enqueues probes that are due (`lastRunAt + intervalSec`). Run it from `npm run worker` (self-host) or an every-minute cron. Vercel Hobby only allows a daily cron, so either document an external pinger or require Pro. Remove probing from `health-dashboard.tsx`
- [ ] `P0` Auto-create an HTTP probe on `${deployedUrl}/health` (60s) when a service is created or updated with a `deployedUrl`
- [ ] `P0` Seed the 3 default alert rules per architecture: `consecutive_down≥3` critical, `p95>2000ms` warning, `error_rate>0.2` critical
- [ ] `P0` Turn the simulator off for any service with a `deployedUrl` or probe. Keep it only for `simulated` demo architectures (fixes B5)
- [ ] `P1` Datastore probes: Postgres/MySQL (`SELECT 1`), Redis `PING`, Kafka metadata, Mongo `ping`. Credentials go in an encrypted secret store
- [ ] `P1` Multi-region / multi-attempt probing to avoid flapping (N-of-M failures before `down`)
- [ ] `P1` Heartbeat / push-mode health for services behind private networks, since we can't probe inward
- [ ] `P1` Metrics ingest: OTLP or Prometheus remote-write for latency, error rate, and saturation. Rules evaluate on metrics, not just probe samples
- [ ] `P2` Retention and downsampling jobs for `HealthRecord` and `LogEntry`
- [ ] `P2` Maintenance windows / silences

### 3.3 Incidents & paging (SP4)
- [x] Lifecycle, dedup, timeline, log snapshot, magic-link ack, synthetic trigger
- [ ] `P0` `OncallSource` (Google Sheet CSV) + `lib/oncall/{sheet-csv,assign}.ts` + `IncidentOncallAssignment`. Enqueue `oncall_assign` when an incident opens
- [ ] `P0` Notify fan-out to architecture members and the on-call person (currently owner only). Add an `IncidentAssignedToOncall` email template
- [ ] `P1` Escalation: if not acked within N minutes, page `escalation_email`. Repeat until acked
- [ ] `P1` Fix auto-resolve notify/publish (B3). Add a `mitigated` transition to the UI
- [ ] `P1` Generic outbound `webhook` channel (declared in `lib/notify/types.ts`, not implemented)
- [ ] `P2` PagerDuty / Opsgenie; Slack interactive ack (instead of a deep link only)
- [ ] `P2` Incident correlation: group co-occurring incidents across dependent services into one parent

### 3.4 AI SRE: RCA + remediation (SP5)
- [x] Context assembly (health, neighbours, logs, regressions, runbook memory), streaming RCA, heuristic fallback
- [x] Fix-PR JSON generation + diff UI + copy/download
- [ ] `P0` Auto-run RCA as an `rca` job when an incident opens, and persist it. The UI attaches to the stream if one is already running
- [ ] `P0` GitHub App: `GithubInstallation` model, `/api/github/app/callback`, installation-token minting, and a "Connect GitHub" button in settings
- [ ] `P0` Give the fix-PR prompt the **real source files** it touches (fetched via the Contents API from `ServiceContract` file/line hits). Today it guesses the paths
- [ ] `P0` `lib/remediation/{classify,code-fix,infra-suggest}.ts` + `Remediation` model. The code path creates a blob, tree, commit, and branch (`servicelens/incident-*`), then opens a **draft** PR linked to the incident
- [ ] `P0` Safety rails: draft only, never merge, only repos on the installation allow-list, one PR per repo per hour, a per-incident lock, and a per-architecture kill switch
- [ ] `P1` Validate that the patch applies (`git apply --check`-equivalent) before opening the PR. Re-prompt on failure
- [ ] `P1` Use deploy/commit history as RCA evidence ("what changed recently" via the GitHub API)
- [ ] `P1` Show the PR status (open/merged/closed) on the incident. Offer to resolve the incident when the PR is merged and health recovers
- [ ] `P2` Chat-with-incident

### 3.5 Regression & chaos
- [ ] `P1` Replace `Math.random` regression with real contract tests: call the extracted `ServiceContract.endpoints` on `deployedUrl` (GET, safe methods only by default) and assert status and schema
- [ ] `P1` Mark chaos as simulation-only in the UI, or add real fault injection via a sidecar/flag endpoint the service opts into
- [ ] `P2` 5-field cron for `ChaosSchedule`; drill report (detection time vs. injected duration)

### 3.6 Platform & multi-tenancy
- [ ] `P0` Migrate all API routes to the role helpers (B4). Add a lint/grep check to CI
- [ ] `P1` **Organization / workspace** layer above Architecture (billing, API keys, GitHub installation, on-call source, members)
- [ ] `P1` Encrypted secrets table for probe headers, DB credentials, and Slack URLs (these are plaintext today)
- [ ] `P1` Swap the realtime bus for Redis pub/sub so multi-instance deployments work. Replace the remaining polling (health page, bell) with SSE
- [ ] `P1` Rate-limit public endpoints (log ingest, v1 registration, magic-link ack)
- [ ] `P2` Move the queue to Inngest/BullMQ once volume justifies it; add SSO (Microsoft); instrument ServiceLens itself with OTel

### 3.7 UI
- [ ] `P1` Topology-first architecture page with a live graph, right rail (open incidents, on-call today, events), and a node drawer (endpoints, deps, health, logs). Spec §8
- [ ] `P1` Onboarding wizard: connect GitHub, pick repos, set deployed URLs, then analyze and review the topology. Show a clear empty state when there's no data
- [ ] `P1` Hide the "simulated" badge and demo data from real (non-demo) architectures
- [ ] `P2` `lib/design-tokens.ts` + token-only lint; Lighthouse a11y ≥ 95

### 3.8 Quality & docs
- [x] Vitest unit suite (14 files / 69 tests), Playwright specs for login, architectures, topology, and incident lifecycle
- [ ] `P0` Tests for B1 (analyze + topology using real contracts), the scheduler, and job handlers
- [ ] `P1` E2E golden path against a stub service whose `/health` can be toggled, with MSW for OpenRouter, Resend, and GitHub
- [ ] `P1` CI workflow running `typecheck`, `test`, and `test:e2e` on PRs (none exists)
- [ ] `P1` **Fix doc drift.** The README and `architecture.md` describe clone-based analysis, a job queue with retry, auto-RCA, GitHub draft PRs, "no polling", and enforced multi-user roles as shipped. They aren't. Mark each one as planned until this checklist closes it
- [ ] `P2` Mark `docs/implementation_plan.md` as superseded by this file plus the real-mesh spec

---

## 4. Definition of done: v1 golden path

This must pass end to end with no manual DB edits and no simulated data:

1. [ ] Sign up → create org and architecture → **Connect GitHub** (App install)
2. [ ] Register N services, either from the UI or via `curl`/`SKILL.md` with an API key, each with a `repoUrl` and `deployedUrl`
3. [ ] Analyze → contracts extracted → **topology auto-derived** with correct edges
4. [ ] Default probes and rules exist. Health updates **with no browser open**
5. [ ] Paste the on-call CSV → roster renders
6. [ ] Break a real service → `consecutive_down` trips → incident opens in under 3 min
7. [ ] On-call gets an email and Slack message → acks via magic link
8. [ ] RCA was already streamed and persisted by the time they open the incident, citing real logs
9. [ ] A **draft PR** exists on the affected repo, linked on the incident
10. [ ] Service recovers → incident auto-resolves → resolution notify sent → runbook memory updated
