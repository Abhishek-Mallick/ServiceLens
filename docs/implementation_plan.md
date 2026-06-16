# ServiceLens — Implementation Plan

Turning the current ServiceLens prototype into a fully functional **AI SRE simulation + observability platform** with real alerting, incidents, email notifications, AI-generated fix PRs, and a Resend-grade UI revamp driven by `DESIGN.md`.

This plan is **phased**. Each phase is independently shippable and leaves the app in a working state. Effort labels: **S** (≤1 day), **M** (2–4 days), **L** (5–10 days).

---

## Guiding principles

- **Real first, simulated as fallback.** Every "fake" code path (simulated health, random regression results, made-up logs) must keep working for the demo, but the platform must support a real backend wherever the user wires one up.
- **Stream everything user-facing.** Analyze, regression run, AI RCA, fix-PR generation — all SSE-streamed, never blocking.
- **One canonical design system.** Adopt `DESIGN.md` (Resend dark editorial) as the single source of truth for tokens, type, spacing, and elevation. Delete ad-hoc Tailwind colors during Phase 5.
- **Persist everything.** No in-memory queues. Postgres + a job table is sufficient until traffic justifies Redis/BullMQ.
- **Demo data must be self-evident.** Anything synthetic is tagged `simulated: true` in DB and badged in the UI.

---

## Current state recap (what's real vs. dummy)

| Subsystem | State | Notes |
|---|---|---|
| Auth, Architecture/Service CRUD | Real | Prisma + NextAuth credentials |
| Git clone + AI/heuristic analysis | Real | Seeded demo repos at `github.com/servicelens-demo/*` **do not exist** — analyze fails |
| Topology builder + React Flow render | Real | Already excellent — promote it |
| Health monitoring | Simulated | `simulateHealth()` sine-wave RNG. Real probes only fire if `healthEndpoint` is full `http(s)://` |
| Regression engine | Simulated | `Math.random() < failureRate`; 5 hardcoded error strings |
| Alerts | UI-only | `AlertsPanel` lists currently-degraded services; no rules, no notifications |
| Incidents | None | No model |
| Logs | None | No model, no UI |
| Realtime | Scaffolded | `socket.io` in deps, not wired — 30s polling instead |
| Notifications (email/Slack) | None | — |
| AI fix PR | None | — |

---

## Phase 0 — Foundations & cleanup (S)

Unblock the demo and prepare for the rest of the plan.

- [ ] **Fix seeded repo URLs**: replace `github.com/servicelens-demo/*` with real public reference repos (e.g. `github.com/GoogleCloudPlatform/microservices-demo` sub-paths) or gate the "Analyze all" button when `analysisStatus === 'completed'` for seeded services.
- [ ] **Introduce `simulated: boolean` flag** on `Service`, `HealthRecord`, `RegressionRun` so the UI can badge synthetic data unambiguously.
- [ ] **Move heavy work off the request thread**: add a `Job` table (`id, type, payload JSON, status, error, createdAt, completedAt`) and a thin in-process worker triggered from API routes. This is the seam later phases plug into.
- [ ] **Env hygiene**: document `OPENROUTER_API_KEY`, `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`, `GITHUB_APP_*` in `.env.example` with clear "optional vs required" annotations.

**Exit criteria:** `npm run dev` + seed gives a working demo with no broken buttons; every fake number in the UI carries a "simulated" badge.

---

## Phase 1 — Real monitoring core: probes, rules, incidents (L)

Make health and alerting the load-bearing subsystem the rest of the platform hangs off.

### 1.1 Real probes
- [ ] Add `Probe` model: `{ serviceId, type: http|tcp|ping|cmd, target, intervalSec, timeoutSec, expectStatus, expectBodyRegex, headers JSON }`. Multiple probes per service.
- [ ] Background runner (`lib/probe-runner.ts`) executes due probes every tick (Vercel Cron in prod, `setInterval` in dev). Writes `HealthRecord` with `simulated: false`.
- [ ] Keep `simulateHealth()` as a fallback when a service has no probes — preserves the seeded demo experience.
- [ ] Probe management UI on the service detail page: add/edit/test-now.

### 1.2 Alert rules engine
- [ ] `AlertRule` model: `{ id, architectureId, scope: service|architecture, serviceId?, condition JSON, window: '1m'|'5m'|'15m', forDuration, severity: info|warning|critical, channels: string[], enabled }`.
- [ ] Condition DSL v1 (JSON, not free text): `status_eq`, `p95_latency_gt`, `error_rate_gt`, `consecutive_down`, `regression_failed`.
- [ ] Evaluator runs after every probe cycle for the affected service.
- [ ] Rule editor UI (forms, not free-text) — preview matches against last 24h history before save.

### 1.3 Incident lifecycle
- [ ] `Incident` model: `{ id, architectureId, ruleId?, serviceId?, title, severity, status: open|acknowledged|mitigated|resolved, openedAt, ackedAt, resolvedAt, assigneeUserId?, summary, rcaMarkdown?, rcaModel? }`.
- [ ] `IncidentEvent` model: `{ incidentId, type: opened|acked|comment|status_change|fix_pr_generated|notification_sent, payload JSON, at, byUserId? }`.
- [ ] Auto-open: rule fires `forDuration` consecutive evals → open incident (dedup by `ruleId + serviceId + open` status).
- [ ] Auto-resolve: condition clears for `2 × forDuration` → resolve.
- [ ] Manual ack / assign / resolve from incident detail page.
- [ ] "Trigger synthetic incident" button on architecture page — flips a chosen service to `down` for N minutes, exercising the whole pipeline for demos.

**Exit criteria:** create a rule → trigger a synthetic incident → see it open in <30s → ack it → see audit trail in `IncidentEvent`.

---

## Phase 2 — Notifications: email, Slack, in-app (M)

Move alerts off the page and into engineers' inboxes.

- [ ] **Provider abstraction** (`lib/notify/`): `NotificationChannel` interface with `email`, `slack`, `webhook`, `inapp` implementations.
- [ ] **Email via Resend** (`resend` npm package). Templates rendered with `@react-email/components` (matches the brand and produces clean HTML):
  - `IncidentOpened` — severity color, summary, link to incident, "Acknowledge" magic-link.
  - `IncidentAcknowledged` / `IncidentResolved`.
  - `FixPRReady` — diff snippet + open-in-app CTA.
  - `WeeklyDigest` — top incidents, MTTR, regression pass rate (later phase).
- [ ] **Slack** via Incoming Webhook URL stored per architecture; Block Kit message with action buttons (Ack, View) — buttons deep-link back into the app.
- [ ] **In-app** notification center in the header (bell icon), backed by `Notification` table.
- [ ] **Per-user preferences** in Settings: which severities to email, quiet hours, Slack handle for `@mentions`.
- [ ] **Magic-link ack** — `/api/notify/ack?token=…` lets an on-call ack from email without logging in (JWT, single-use, 24h expiry).
- [ ] **Notification log** on each incident: which channel sent what, when, delivery status.

**Exit criteria:** opening an incident sends a real email via Resend (when key configured), appears in Slack, and shows in the bell menu; ack-from-email works.

---

## Phase 3 — Logs subsystem (M)

The AI SRE story is much weaker without logs. Even synthetic logs give the LLM something to reason over.

- [ ] `LogEntry` model: `{ serviceId, level: debug|info|warn|error, message, fields JSON, traceId?, spanId?, at }` with `@@index([serviceId, at])`.
- [ ] **Ingestion API** `POST /api/services/:id/logs` accepting batched JSON lines (HEC-style). Bearer token per service.
- [ ] **Synthetic log generator** runs alongside `simulateHealth` — baseline info logs every N seconds, error spikes correlated with degraded/down windows. Marked `simulated: true`.
- [ ] **Log search UI**: time-window picker, level filter, free-text grep, service multi-select. Virtualized list (react-window) for 10k+ rows.
- [ ] **Tail mode** with SSE — live append as new logs arrive.
- [ ] **Auto-attach to incidents**: when an incident opens, snapshot the last 5 minutes of logs from the affected service + immediate upstream/downstream neighbors into `IncidentEvent`.

**Exit criteria:** incident detail page shows correlated logs in a collapsible panel; tail mode streams live in dev.

---

## Phase 4 — AI SRE layer: streaming RCA + fix PR (L)

The headline feature.

### 4.1 Streaming RCA
- [ ] On incident open, enqueue `rca` job. Worker calls OpenRouter with **streaming enabled** (`stream: true`, SSE).
- [ ] Prompt context: incident metadata, affected service `analysisResult`, last 24h health of self + 1-hop upstream/downstream (via `ServiceDependency`), recent failed regression steps, attached log snippet.
- [ ] Result streamed token-by-token to the incident detail page over SSE; persisted to `Incident.rcaMarkdown` on completion.
- [ ] Cite sources inline: log line IDs, regression step IDs — clickable in the UI.

### 4.2 Runbook memory (RAG-lite)
- [ ] On incident resolve, prompt the user (and/or auto-generate) a one-paragraph "What fixed it". Store on `Incident.resolution`.
- [ ] On new incident, search prior resolved incidents on the same service or same rule by simple BM25/keyword overlap (no embeddings needed v1). Inject top-3 into the RCA prompt as `prior fixes that worked`.

### 4.3 AI fix-PR generation
- [ ] "Generate fix PR" button on incident detail (visible once RCA completes). Second LLM pass.
- [ ] Prompt context: RCA + service `analysisResult` (which already contains extracted route/event/config facts) + repo file list (cached from last analyze).
- [ ] Output: structured JSON `{ summary, branchName, files: [{ path, patch (unified diff) }], prTitle, prBody }`.
- [ ] **v1 UI-only**: render the diff inline (use `diff2html` or `react-diff-viewer`), "Copy as patch" + "Download .patch" buttons.
- [ ] **v2 real PR**: GitHub App (env: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`). On click, create branch, commit patch, open draft PR, link back in `IncidentEvent`. Send `FixPRReady` notification.
- [ ] Safety rails: never auto-merge, never push without explicit click, dry-run by default.

### 4.4 Chat-with-incident (stretch)
- [ ] Sidebar chat on the incident page. Conversation history persisted per incident. Context: RCA + logs + topology subgraph.

**Exit criteria:** triggering a synthetic incident streams a coherent RCA in <10s and offers a plausible fix PR diff in the UI.

---

## Phase 5 — UI revamp using `DESIGN.md` (L)

Adopt the Resend dark editorial design system end-to-end.

### 5.1 Token + foundation setup
- [ ] Build `lib/design-tokens.ts` exporting every token from `DESIGN.md` (colors, typography, spacing, rounded). Generate Tailwind config from it so `bg-canvas`, `text-ink`, `border-hairline`, `rounded-lg`, `font-display`, `font-body`, `font-ui`, `font-mono` map 1:1.
- [ ] Replace `app/globals.css` HSL CSS variables with the `DESIGN.md` color palette (`canvas #000`, `surface-card #0a0a0c`, `surface-elevated #101012`, `surface-deep #06060a`, `ink #fcfdff`, `body 86% white`, accent glows).
- [ ] **Fonts**:
  - Domaine Display → use **Söhne** or **Tiempos Headline** fallback per `DESIGN.md`. If unavailable, ship `Fraunces` from Google Fonts as an open-source serif stand-in, clamped to `lineHeight: 1.0` with `font-feature-settings: "ss01","liga"`.
  - ABC Favorit → fall back to `Geist` (open-source).
  - `Inter` for UI labels, `Geist Mono` for code. Wire via `next/font/google` and `next/font/local`.
- [ ] **Elevation language**: ban `box-shadow` in component CSS. Use hairline borders (`rgba(255,255,255,0.06)` / `0.14`) and surface luminance shifts only.

### 5.2 Component layer rebuild (shadcn → tokenized)
Rewrite `components/ui/*` to consume only design tokens. One PR per family to keep diffs reviewable.

- [ ] `button` → `button-primary` (white pill, black text, `rounded-md`), `button-ghost` (surface-elevated), `button-outline` (canvas + hairline). All 36px tall, scale to 44px on mobile.
- [ ] `card` → `feature-card` and `feature-card-bordered` variants; `rounded-lg`, `surface-card`, `padding 32px`.
- [ ] `input` / `textarea` → `text-input` spec: `surface-card`, hairline-strong border, focus thickens border to `ink` (no separate ring).
- [ ] `badge` → `badge-pill` (`surface-elevated`, `caption` type, `rounded-full`).
- [ ] `dialog` / `sheet` → black canvas, hairline border, no backdrop shadow (use 80% black scrim instead).
- [ ] `tabs` → underline-only active state in `ink`, no filled pill.
- [ ] **New**: `code-window` component for log snippets, diff viewer chrome, fix-PR preview — `surface-deep #06060a`, 3-dot traffic lights, `Geist Mono`.
- [ ] **New**: `status-dot` (8px, `rounded-full`, accent-green/yellow/red mapped from `healthy/degraded/down`).
- [ ] **New**: `atmospheric-glow` wrapper — single radial-gradient backdrop using `accent-*-glow` tokens, one per major section.

### 5.3 Surface-by-surface refresh
- [ ] **Auth pages**: black canvas, 96px Domaine Display headline ("Mesh, observed."), centered text-input, single white `button-primary`. No card chrome.
- [ ] **Dashboard** (`/dashboard`): hero band (display-xxl headline + 1-line subtitle), then a **topology preview as the hero visual** below the headline (read-only React Flow, fit-view, click to open full). KPI cards drop to small `badge-pill` strip beneath. Remove ad-hoc gradients.
- [ ] **Sidebar**: keep collapsed, restyle with `font-button-sm`, hairline divider, active item in `ink` with a 2px left bar in `accent-blue` (the only place blue solid appears).
- [ ] **Topology page**: dark canvas with a faint atmospheric glow per active incident severity (red glow if any service is `down`, orange if `degraded`). Legend pill row at top-left using `sub-nav-pill`.
- [ ] **Service detail** (promote from side-sheet to full route): tabs `Overview · Topology · Probes · Health · Logs · Incidents · Analysis`. Each tab uses `feature-card` + `code-window` where applicable.
- [ ] **Incident detail**: editorial layout — `display-lg` title, severity chip, RCA streamed into a `feature-card` with a `code-window` for logs and a `code-window`-styled diff viewer for the fix PR.
- [ ] **Settings**: per-user notification prefs, API keys (for log ingestion), connected integrations (Slack, GitHub App) — each in a `pricing-tier`-style card.
- [ ] **Empty + loading states**: Domaine Display "Nothing here yet" + single CTA. Skeletons use `surface-elevated` blocks with no shimmer (matches the no-shadow language).

### 5.4 Architecture builder (visual canvas)
The current "new architecture" flow is name+description only. Replace with a two-step wizard:
1. **Name + template** picker (E-commerce / SaaS / Streaming / Blank).
2. **Visual canvas** built on the same React Flow library already in the topology view. Drag service/db/broker nodes from a palette, connect edges, name nodes, optionally bind to a Git repo. Save persists as `Service` + `ServiceDependency` rows so the existing topology renderer just works.

### 5.5 Polish
- [ ] Command palette (⌘K) — `cmdk` library — jump to architecture, service, incident, log search.
- [ ] Page transitions with `framer-motion` (already a dep): 200ms opacity+1px-y, nothing flashy.
- [ ] Keyboard shortcuts: `g d` (dashboard), `g a` (architectures), `g i` (incidents), `/` (search).
- [ ] WCAG: verify contrast on `body 86%` and `charcoal 70%` text against `surface-card`. Add focus-visible rings using `ink` (not blue) per the design language.

**Exit criteria:** every screen passes a token-only lint (no raw hex outside `design-tokens.ts`), Lighthouse a11y ≥ 95, Domaine Display headlines clamp correctly across breakpoints per the `DESIGN.md` ladder.

---

## Phase 6 — Realtime + chaos drills (M)

- [ ] Wire the scaffolded Socket.IO server. Channels: `arch:{id}:health`, `arch:{id}:incidents`, `arch:{id}:logs`. Replace the 30s polling in `HealthDashboard` with `useSocket`.
- [ ] Live topology: pulse node + edge in real time when health flips. Reuse `animatedEdges`/`activeServiceIds` props that already exist on `TopologyView`.
- [ ] **Chaos drills**: `ChaosSchedule` model — `{ architectureId, cron, action: kill_service|degrade|latency_spike, targetServiceId, durationSec }`. Friday 14:00 take Payment down for 8 minutes — exercises alerts → incidents → notifications → RCA → fix PR end-to-end and stores a "drill report" comparing detection time vs. actual incident duration.

---

## Phase 7 — Productionization (M, optional but recommended)

- [ ] Move `Job` table to a real queue (Inngest or BullMQ + Upstash Redis) once probe count or log volume justifies it.
- [ ] Rate-limit Git clones, cap repo size, sandbox `/tmp` writes.
- [ ] Multi-user per architecture (`ArchitectureMember` with roles `owner | editor | viewer`).
- [ ] SSO via NextAuth (Google, GitHub already scaffolded; add Microsoft).
- [ ] Audit log (`AuditEvent`) for security-sensitive actions.
- [ ] Observability for the platform itself: OpenTelemetry traces → Honeycomb/Grafana Cloud free tier.
- [ ] Docker compose for local Postgres + Mailhog + Redis so contributors don't need Neon to develop.

---

## Phase 8 — Testing & docs (S, threaded through every phase)

- [ ] **Vitest**: rule evaluator, incident state machine, notification provider mocks, fix-PR JSON validator. Aim for 80% coverage on `lib/`.
- [ ] **Playwright**: incident lifecycle E2E (trigger synthetic → see UI update → ack → resolve), AI RCA streaming E2E (mock OpenRouter SSE), fix-PR generation E2E.
- [ ] **MSW** for mocking OpenRouter, Resend, Slack, GitHub APIs in tests.
- [ ] **README + docs site**: per-feature walkthroughs with screenshots. Use the new design system for the docs pages too — eat your own dog food.

---

## Data model summary (new tables introduced)

```
Probe           — per-service health probe config
AlertRule       — fire condition + channels
Incident        — lifecycle, RCA, resolution
IncidentEvent   — append-only audit log per incident
LogEntry        — ingested or synthetic log line
Job             — async work tracker
Notification    — in-app notification feed
NotificationLog — channel delivery audit
ChaosSchedule   — scheduled fault injection
AuditEvent      — security-sensitive actions (Phase 7)
ArchitectureMember — multi-user roles (Phase 7)
```

All keep the existing convention: JSON-shaped fields as `String` decoded with `parseJson<T>()`, no Postgres-specific column types.

---

## Suggested delivery order

1. **Phase 0** — unblock demo (2 days)
2. **Phase 1** — monitoring core (1.5 weeks) — biggest single unlock; everything else depends on it
3. **Phase 2** — notifications (1 week) — turn the platform from a dashboard into a tool people actually use
4. **Phase 5.1 + 5.2** — design tokens + component layer in parallel with Phase 2 (1 week, separate PR track)
5. **Phase 3** — logs (3–4 days) — needed before AI RCA is useful
6. **Phase 4** — AI SRE (1.5 weeks) — the headline feature
7. **Phase 5.3 + 5.4 + 5.5** — finish UI revamp on the now-stable feature set (1 week)
8. **Phase 6** — realtime + chaos drills (3–4 days) — turns the demo into a *story*
9. **Phase 7** — productionization (ongoing)
10. **Phase 8** — testing + docs (threaded throughout, hardened at the end)

Total: roughly **6–8 weeks of focused single-developer work** for Phases 0–6.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| OpenRouter free-tier rate limits stall RCA in demos | Keep heuristic fallback path; cache RCAs per incident; show a "regenerate" button rather than auto-retrying |
| Resend / Slack credentials missing in local dev | Provider abstraction logs to console as a 4th channel; demo works without any external API keys |
| GitHub App PR creation has long approval/setup lead time | Ship UI-only fix PR (Phase 4.3 v1) first; v2 PR-creation is an opt-in flip |
| Synthetic data conflicts with real probes after Phase 1 | `simulated` flag + UI badge; never mix the two in the same chart series |
| Design system rewrite breaks existing flows | Migrate component-by-component behind a `?ui=new` flag during Phase 5.2; flip the default once parity is verified |
| Postgres-only job queue won't scale | Phase 7 swaps in Inngest/BullMQ without API changes (the `Job` table is behind a `JobStore` interface) |

---

## Definition of "done" for v1.0

- A new user can sign up, create an architecture from a template, see a live topology on the dashboard, configure a probe + alert rule, trigger a synthetic incident, receive a real email + Slack notification, open the incident, read a streamed AI RCA citing real logs, click "Generate fix PR" and either copy the diff or open a real draft PR on GitHub — without any developer-side setup beyond environment variables.
- Every screen uses only `DESIGN.md` tokens; no raw colors or font-families in components.
- Test suite green; Playwright covers the full incident lifecycle.
