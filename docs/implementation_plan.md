# ServiceLens — Implementation Plan

Turning the ServiceLens prototype into a fully functional **AI SRE + observability platform**: real onboarding of a company's whole topology, real monitoring, alerting, incidents, paging, AI root-cause analysis and fix PRs, and a UI driven by `DESIGN.md`.

> **Status as of 2026-09-13 (after chunk 5):** the core platform is built and verified end to end. Phases 0–4 and 7 are essentially complete, and the product went beyond the original plan (see §A). The remaining big pieces are the **design-system revamp (Phase 5)**, **multi-instance realtime and queue (Phases 6–7)**, **metrics ingest**, and **CI/E2E hardening**. The living checklist, with bugs and a detailed progress log, is [`STATUS.md`](./STATUS.md). How to use everything is in [`USER_GUIDE.md`](./USER_GUIDE.md).

Legend: `[x]` done · `[~]` partly done (what's missing is noted) · `[ ]` not started. Effort: **S** (≤1 day), **M** (2–4 days), **L** (5–10 days).

---

## A. Progress summary — done vs. left

### Done
| Area | What shipped | Where |
|---|---|---|
| **Onboarding** | Wizard (repo + deployed URL per service, no fake templates); add/edit/delete service; **self-registration API** (`PUT /api/v1/services/{name}`) with architecture API keys; `/SKILL.md` so agents can onboard a whole topology; CI recipes | `lib/onboarding.ts`, `app/api/v1/**`, `public/SKILL.md` |
| **Repo analysis** | GitHub API + raw CDN at a pinned SHA (2 API calls/service), default-branch fallback, private repos through the GitHub App; Express/Next.js route + env-var dependency extraction | `lib/ingest/*`, `lib/analyze.ts` |
| **Topology** | Edges derived from code (host match → env-name match → ambiguous/unresolved); **dependency review** (confirm / reject / link / ignore / manual edge) that survives re-analysis; ambiguous edges drawn dashed | `lib/topology/*`, `EdgeOverride` |
| **Monitoring** | Server-side scheduler (in-process, worker, or cron); HTTP/TCP probes; **Postgres and Redis checks**; **heartbeats** for private services; default probe + 3 default rules; Prometheus-style `for` semantics; SSRF guard at DNS-resolution time | `lib/scheduler.ts`, `lib/probes.ts`, `lib/datastore-probes.ts`, `lib/net-guard.ts` |
| **Regression** | **Contract tests**: every GET route from the code called on the deployed URL (catches deploy drift and 5xx), manual, scheduled, or as a CI gate; the simulated engine is confined to the demo | `lib/contract-tests.ts` |
| **Incidents & paging** | Lifecycle, one incident per service (other rules attach), auto-resolve; on-call directory (Google Sheet CSV) with escalation; member fan-out with per-user prefs; magic-link ack for non-users (scanner-safe) | `lib/incidents.ts`, `lib/incident-pipeline.ts`, `lib/oncall/*`, `lib/notify/*` |
| **AI SRE** | RCA generated automatically on open; **fix PRs from real source** (pinned SHA, server-computed diff, draft PR through the GitHub App, conflict check, 1 PR/repo/hour, never merges, optional auto mode); never faked when the LLM is unavailable | `lib/rca.ts`, `lib/fix-pr.ts`, `lib/remediation.ts`, `lib/github/app.ts` |
| **Platform** | Durable job queue with immediate in-process runs; multi-user roles enforced on every route (static guard test); audit log; **credentials encrypted at rest** (AES-256-GCM: datastore strings, probe headers, Slack webhooks); API-key rate limits | `lib/jobs.ts`, `lib/access.ts`, `lib/secrets.ts` |
| **Demo** | Seeded e-commerce mesh flagged `demo`, shared read-only with every user; the only place simulated data may exist | `Architecture.demo`, `lib/demo.ts` |
| **Workspace** | Architecture home = live topology with status/incident overlays, filters, search, service and edge drawers, incidents / on-call / activity rail; one graph renderer for workspace, dashboard and regression | `components/workspace/*`, `lib/workspace.ts` |
| **Design tokens** | `lib/design-tokens.ts` is the single source; Tailwind generated from it; parity test vs DESIGN.md; token-only lint for the workspace | `lib/design-tokens.ts`, `tests/design-tokens.test.ts` |
| **Quality & docs** | 188 unit tests, 12 Playwright specs, **CI** (typecheck + unit + E2E on Postgres); `USER_GUIDE.md`, `secrets.md`, `STATUS.md`, `SKILL.md` | `tests/**`, `.github/workflows/ci.yml`, `docs/**` |

### Left
| Priority | Item | Notes |
|---|---|---|
| P1 | **Token-only migration of the remaining screens** (Phase 5.2–5.3) + WCAG pass | Tokens and the workspace are done; older screens still use shadcn/HSL classes |
| P1 | **Metrics ingest** (OTLP / Prometheus remote-write) and rules on metrics | Probes + logs are the only signals today |
| P1 | **MSW-mocked golden-path E2E** on a real architecture (outage → page → RCA → fix PR) | CI itself is done |
| P1 | Multi-instance **realtime** (Redis pub/sub) and **queue** (BullMQ/Inngest) | Single-instance SSE bus today |
| P1 | More extractors: NestJS, Fastify, Spring, FastAPI/Flask, Go; Kafka/DB detection from config | Express/Next.js only today |
| P1 | Organization/workspace layer; invite by email for people without accounts | Architecture is the top-level scope today |
| P1 | Rule editor "preview against last 24 h"; probe edit UI; MySQL/Mongo checks | |
| P2 | Webhook channel, PagerDuty/Opsgenie, weekly digest, cross-service incident correlation | |
| P2 | Clickable RCA citations, chat-with-incident, auto-drafted resolution notes, infra-suggestion cards | |
| P2 | Retention/downsampling, maintenance windows, Microsoft SSO, OpenTelemetry for ServiceLens itself | |

---

## Guiding principles

- ~~**Real first, simulated as fallback.**~~ **Real only; simulation is confined to the demo.** Every architecture a user creates shows only data from real repos, probes and ingest. Simulated health, chaos, synthetic logs and incidents, and simulated regression exist only on the seeded demo (`Architecture.demo`); the API refuses them elsewhere (`code: "demo_only"`).
- **Stream everything user-facing.** Analyze, RCA and fix-PR generation are streamed or run as background jobs, never blocking.
- **One canonical design system.** Adopt `DESIGN.md` as the single source of truth *(Phase 5, still open)*.
- **Persist everything.** Postgres + a `Job` table; no in-memory queues.
- **Never fake output that turns into real changes.** Fix PRs are never generated without a working LLM, and never merged.

---

## Current state recap

| Subsystem | Original plan (2026-05) | Now (2026-09-13) |
|---|---|---|
| Auth, Architecture/Service CRUD | Real | Real, plus role-based sharing and API keys |
| Git analysis | Clone + LLM; demo repos broken | GitHub API ingestion; contracts; dependency review |
| Topology | Real | Derived from code, with human overrides |
| Health monitoring | Simulated | Real probes (HTTP/TCP/Postgres/Redis/heartbeat), server-scheduled |
| Regression | `Math.random` | Contract tests on deployed services (demo keeps simulation) |
| Alerts | UI-only | Rules engine with default rules |
| Incidents | None | Full lifecycle, on-call, escalation |
| Logs | None | HEC-style ingest, search, tail, incident snapshots |
| Realtime | Scaffolded | SSE bus (single instance) |
| Notifications | None | In-app, email (Resend), Slack |
| AI fix PR | None | Draft PRs from real source via GitHub App |

---

## Phase 0 — Foundations & cleanup (S) — ✅ done

- [x] **Fix seeded demo** — done differently: the seeded mesh is flagged `demo`, its analysis never hits GitHub, and `db:migrate-demo` removes placeholder probes.
- [x] **`simulated` flag** on `Service`, `HealthRecord`, `RegressionRun`, `Incident`, `LogEntry`, plus `Architecture.demo`.
- [x] **Job table + worker** — `lib/jobs.ts` (`enqueue`, `drain`, `kick`), handlers in `lib/job-handlers.ts`, driven by `lib/scheduler.ts`.
- [x] **Env hygiene** — `.env.example` annotated; `docs/secrets.md` covers every variable and Vercel setup.

## Phase 1 — Real monitoring core (L) — ✅ done

### 1.1 Real probes
- [x] `Probe` model. Types: `http`, `tcp`, **`postgres`**, **`redis`**, **`heartbeat`** (`ping`/`cmd` dropped: arbitrary commands are unsafe on a multi-tenant host).
- [x] Background runner: `lib/scheduler.ts` claims due probes atomically; in-process loop, `npm run worker`, or `/api/cron/tick`.
- [x] `simulateHealth()` kept **only for the demo**; real services without probes stay `unknown`.
- [~] Probe management UI: add / run now / delete. *(Editing needs the API; there's no edit form yet.)*

### 1.2 Alert rules engine
- [x] `AlertRule` model and JSON DSL (`status_eq`, `p95_latency_gt`, `error_rate_gt`, `consecutive_down`, `regression_failed`).
- [x] Evaluator after every probe, with **continuous-`for`** semantics (one bad check never pages).
- [~] Rule editor UI (forms). *Missing: preview against the last 24 h.*

### 1.3 Incident lifecycle
- [x] `Incident` / `IncidentEvent`; auto-open with dedup and **one incident per service** (other rules attach as `related_alert`); auto-resolve after 2× window.
- [x] Manual ack / assign / comment / resolve.
- [x] Synthetic incidents (demo only).

## Phase 2 — Notifications (M) — ✅ done (webhook + digest open)

- [x] Provider abstraction (`inapp`, `email`, `slack`, `console`). *`webhook` declared, not implemented.*
- [x] Email via Resend + React Email: opened, acknowledged, resolved, **escalated**, **fix PR ready**. *Weekly digest not done.*
- [x] Slack Block Kit with deep links. Webhook URL **encrypted at rest**, only shown masked.
- [x] In-app bell (`Notification`).
- [x] Per-user preferences (severity threshold, quiet hours, email/Slack opt-out).
- [x] Magic-link ack: per-recipient signed tokens, works for non-users, **confirmation page + POST** so mail scanners can't ack.
- [x] Notification log per incident.
- [x] *Beyond plan:* **on-call directory** (Google Sheet CSV), time-based **escalation**, member fan-out.

## Phase 3 — Logs (M) — ✅ done

- [x] `LogEntry` model; ingest API `POST /api/services/:id/logs` (JSON, array, or NDJSON) with a per-service bearer token.
- [x] Synthetic log generator (demo only).
- [x] Log search UI (level, text, service, window) and SSE tail.
- [x] Auto-attach: warn/error lines from the service + 1-hop neighbours are snapshotted when an incident opens.

## Phase 4 — AI SRE layer (L) — ✅ done (chat open)

### 4.1 RCA
- [x] Generated automatically as an `rca` job when an incident opens (real architectures); streamed when started from the UI; persisted.
- [x] Context: incident, service, 30-min health, 1-hop neighbours, log snapshot, failed regression steps, prior resolutions.
- [~] Cited sources. *They're cited in text, not clickable.*

### 4.2 Runbook memory
- [x] Resolution notes stored on resolve and reused (keyword overlap) in future RCA and fix prompts.
- [ ] Auto-drafted "what fixed it" summary.

### 4.3 Fix PRs
- [x] Generated from the **real source files** the RCA points at (via the service contract), read at a pinned commit; model returns full files; diff computed server-side and validated.
- [x] Diff UI with copy / download `.patch`.
- [x] **Real draft PRs** through the GitHub App (per-repo installation lookup), `FixPRReady` notification, PR state sync.
- [x] Safety rails: draft only, never merge, `servicelens/` branches only, blob-SHA conflict check, 1 PR/repo/hour, idempotent per incident, auto mode off by default.
- [x] *Beyond plan:* in-app **GitHub coverage** per repo + install flow (`/api/github/setup`).

### 4.4 Chat-with-incident
- [ ] Not started.

## Phase 5 — UI revamp using `DESIGN.md` (L) — 🟡 partly done

### 5.1 Tokens + foundation
- [x] `lib/design-tokens.ts` holds every DESIGN.md color, radius and spacing token (parity-tested); `tailwind.config.ts` is generated from it; status/severity/edge color mappings live there too.
- [x] Fonts wired (Fraunces as the Domaine Display stand-in, Inter, JetBrains Mono).
- [ ] No-box-shadow elevation language enforced.

### 5.2 Component layer
- [ ] Token-only rewrite of `components/ui/*`; `code-window`, `status-dot`, `atmospheric-glow`.

### 5.3 Surface refresh
- [x] **Topology as the hero:** the architecture home is the live workspace (graph + drawers + incidents/on-call/activity rail), token-only.
- [~] Other surfaces use the dark editorial style but still shadcn/HSL classes. *Missing: token-only migration, editorial incident layout.*
- [x] Empty and loading states for the new flows (onboarding wizard, analysis, contract tests, dependency review).

### 5.4 Architecture builder
- [x] **Replaced by the onboarding wizard** (repo + deployed URL per service, then analyze). Dependencies come from code plus the review UI, so a hand-drawn canvas is no longer needed.

### 5.5 Polish
- [x] ⌘K command palette; `g d` / `g a` leader shortcuts.
- [ ] Page transitions; WCAG / Lighthouse pass; token-only lint.

## Phase 6 — Realtime + chaos drills (M) — 🟡 partly done

- [~] Realtime: multiplexed **SSE** per architecture (health, incidents, chaos, notifications) instead of Socket.IO. *Single instance only; the bell still polls.*
- [x] Live topology pulses on health and incident events.
- [x] Chaos drills (scheduled or manual) — **demo only**, since they write simulated health. *Missing: drill report; real fault injection via an opt-in sidecar.*

## Phase 7 — Productionization (M) — 🟡 mostly done

- [ ] Move the `Job` table to Inngest / BullMQ + Redis (the `JobType` contract is ready).
- [x] Repo ingestion without `git clone` (GitHub API, size and file caps) — replaces "rate-limit clones / sandbox /tmp".
- [x] Multi-user `ArchitectureMember` roles (owner / editor / viewer), enforced everywhere.
- [~] SSO: GitHub + Google. *Microsoft not done.*
- [x] Audit log (`AuditEvent`) for security-sensitive actions.
- [ ] OpenTelemetry for ServiceLens itself.
- [x] Docker Compose for local Postgres.
- [x] *Beyond plan:* SSRF guard; encryption at rest; API keys + rate limit; `CRON_SECRET`; GitHub Actions scheduler pinger.

## Phase 8 — Testing & docs — 🟡 mostly done

- [x] **Vitest:** 188 tests (rules timing, topology + overrides, SSRF guard, secrets, datastore probes, contract tests, notify recipients, roster, fix-PR diffing, API keys, authz guard…).
- [~] **Playwright:** 12 specs (login, architectures, workspace, chaos, palette, incident lifecycle). *Missing: a golden path on a real architecture with MSW-mocked OpenRouter/Resend/GitHub.*
- [ ] **MSW** mocks. *(Verification runs use local fake GitHub/LLM servers instead — see STATUS.)*
- [x] Docs: README, `USER_GUIDE.md`, `secrets.md`, `LOCAL_SETUP.md`, `deploy_vercel.md`, `STATUS.md`, `SKILL.md`.
- [x] CI workflow: typecheck + unit on every push/PR; Playwright against Postgres with the seeded demo.

---

## Data model (as built)

```
Architecture (+ demo, autoFixPr, contractTestIntervalMin)
Service (+ deployedUrl, healthPath, heartbeat*)   ServiceContract   ServiceDependency
EdgeOverride      — human decisions on dependency edges
Probe (+ secret)  — http | tcp | postgres | redis | heartbeat
HealthRecord      AlertRule      Incident      IncidentEvent
IncidentOncallAssignment   OncallSource
Remediation       — draft fix PRs
LogEntry          RegressionRun / RegressionTestStep (contract tests)
Job               Notification   NotificationLog   UserNotificationPref
ArchitectureMember   ApiKey   AuditEvent   ChaosSchedule (demo)
```
JSON-shaped fields stay `String` decoded with `parseJson<T>()`. Credentials are `enc:v1:…` strings (`lib/secrets.ts`).

---

## Suggested order for what's left

1. **Token-only migration of the remaining screens** (Phase 5.2–5.3) + **MSW golden-path E2E** (L).
3. **Metrics ingest (OTLP)** and rules on metrics (L).
4. **Extractors for more stacks** (M): widens who can onboard.
5. **Org layer + invite by email** (M), then **Redis realtime/queue** (M) when running more than one instance.

---

## Definition of "done" for v1.0

- [x] A new user can sign up, explore the demo, and create an architecture.
- [x] Register services (UI, API, or agent via `SKILL.md`) and see the topology derived from their code.
- [x] Health checks, datastore checks and heartbeats run with no browser open; default rules exist.
- [x] Configure an on-call sheet; a real outage opens an incident, pages on-call by email/Slack, escalates, and can be acked from email.
- [x] Open the incident to a ready AI RCA; open a draft fix PR generated from the real source (with the GitHub App installed).
- [x] Contract tests catch deploy drift after every deploy (CI gate).
- [~] Every screen uses only `DESIGN.md` tokens: the workspace and graph are token-only (lint-enforced); the remaining screens are pending.
- [~] Test suite green and running in CI ✅; an MSW-mocked golden-path E2E is still to do.
