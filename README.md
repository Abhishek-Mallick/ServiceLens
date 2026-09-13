# ServiceLens

> The mesh, observed. Map Git-backed microservices, run continuous health probes, evaluate alert rules, manage incidents, and stream AI root-cause analysis with actionable fix-PR output.

**Live demo:** [servicelens.buildlab.in](https://servicelens.buildlab.in) · **Training environment:** [Incident Triage Env (HF Space)](https://huggingface.co/spaces/AbhishekMallick/incident-triage-env)

ServiceLens is a full-stack **observability intelligence platform** for microservice architectures. It automatically discovers service dependencies, API contracts, event flows, and runtime topology graphs from distributed repositories using graph-based analysis. The platform monitors health with declarative probes and alert rules, opens lifecycle-managed incidents, and streams evidence-grounded root-cause analysis plus structured fix-PR output — designed to **reduce MTTR** by surfacing cited evidence and actionable remediation instead of raw alert noise.

The RCA and fix-PR pipeline is informed by models and investigative patterns trained in a companion [**Incident Triage Environment**](https://github.com/deepraj21/Incident-Triage-Env/tree/feat/incident-triage-env) — an OpenEnv-compliant RL simulator where agents learn production-grade triage under realistic operational constraints.

---

## Architecture

ServiceLens follows a hub-and-spoke model: a thin API layer over a testable platform core, with an in-process realtime bus fanning events to SSE clients and external services handling AI, notifications, and Git operations.

<img width="1925" height="1892" alt="image" src="https://github.com/user-attachments/assets/4ff8e3db-add3-4dda-86c9-cbd7a018cc22" />

| Layer | Components |
|---|---|
| **Clients** | Web dashboard, external cron/worker, HEC log ingest from service teams |
| **Platform core** | Topology discovery · probe engine · alert rules · incident lifecycle · RCA + fix-PR · realtime SSE bus |
| **Data** | PostgreSQL — architectures, services, dependency graph, health, incidents, logs, audit |
| **External** | Git remotes · OpenRouter · Resend · Slack · GitHub OAuth/App |
| **Training** | [Incident Triage Env](https://huggingface.co/spaces/AbhishekMallick/incident-triage-env) — OpenEnv RL simulator that shapes RCA investigative patterns |

Full diagrams — observability loop, incident lifecycle, RCA pipeline, fix-PR flow: **[`docs/architecture.md`](./docs/architecture.md)** · Eraser prompt: **[`docs/architecture-prompt.md`](./docs/architecture-prompt.md)**

---

## Capabilities

| Area | Capability | Highlights |
|---|---|---|
| **Discovery** | Service topology | Reads each repo through the GitHub API at a pinned commit (no clone); extracts Express/Next.js routes and env-var dependencies, derives edges between services, and lets people confirm or correct them. The architecture home is a live graph with health and incident overlays |
| **Discovery** | Self-registration | Architecture API keys + idempotent `PUT /api/v1/services/{name}` for CI and agents (`/SKILL.md`) |
| **Observability** | Health probes | HTTP/TCP, Postgres and Redis checks run server-side on a schedule (SSRF-guarded); heartbeats (push) for private services; simulated data only on the demo mesh |
| **Observability** | Alert rules | JSON DSL (`status_eq`, `p95_latency_gt`, `error_rate_gt`, `consecutive_down`, `regression_failed`); Prometheus-style `for` durations + auto-resolve; 3 default rules per architecture |
| **Observability** | Log aggregation | HEC-style bearer-token ingest (rate-limited), search, SSE live tail; synthetic logs only on the demo |
| **Observability** | Contract tests | Every parameter-free GET route found in the code is called on the deployed URL to catch deploy drift and 5xx — manually, on a schedule, or as a CI gate |
| **Reliability** | Incidents & paging | One incident per service, auto-opened and auto-resolved; on-call sheet with escalation; email/Slack with a scanner-safe magic-link acknowledge |
| **Reliability** | Runbook memory | Human resolution notes, or a facts-only summary ServiceLens records on auto-resolve (duration, ack, RCA cause, fix PR), feed future RCAs |
| **Reliability** | Chaos drills | Demo mesh only (they write simulated health) |
| **AI SRE** | Root-cause analysis | 6-signal context assembly (health, neighbors, logs, regressions, runbook); streamed markdown RCA over SSE |
| **AI SRE** | Fix PRs | Generated from the RCA and the service's real source at a pinned commit; the diff is computed server-side; opened as a **draft PR** via the GitHub App (manual or automatic). Conflict-checked, 1 PR/repo/hour, never merges |
| **Realtime** | Live updates | Multiplexed SSE per architecture — topology pulses, health changes, incidents (single instance; the bell polls) |
| **Realtime** | Notifications | In-app feed, Resend email, Slack webhooks with magic-link acknowledge |
| **Platform** | Multi-user workspaces | Per-architecture `owner` / `editor` / `viewer` roles; append-only audit log on every mutation |

---

## How RCA works

Root-cause analysis is evidence-first, not a black-box chatbot.

1. **Trigger** — Opening an incident (alert rule, chaos drill, or manual) captures a log snapshot from the affected service and its 1-hop neighbors.
2. **Assemble** — When RCA runs, the pipeline gathers:
   - 30-minute health window on the affected service
   - Current status of topology neighbors (via `ServiceDependency` edges)
   - Warn/error log lines from the open-time snapshot
   - Recent failed regression steps on the architecture
   - Up to three prior resolved incidents on the same service, ranked by keyword overlap (runbook RAG-lite)
3. **Stream** — A structured prompt is sent to OpenRouter. Tokens stream to the incident detail page over SSE and persist incrementally to the database.
4. **Report** — The model produces markdown with three sections: **Likely root cause**, **Evidence** (citing specific timestamps and log lines), and **Suggested next steps**.
5. **Act** — The fix step reads the source files the RCA points at (at a pinned commit), asks the model for full corrected files, computes the diff server-side and opens a **draft PR** through the GitHub App — on click, or automatically in auto mode. It never merges.

On real architectures the RCA runs as a background job the moment the incident opens. When the LLM is unavailable the RCA falls back to a heuristic report; fix PRs are never faked and return a clear "AI unavailable" error instead.

The RCA prompt design emphasizes **evidence citation and causal-chain reasoning** — the same skills the Incident Triage grader rewards during training (direct evidence hits, dependency-tracing strategy, red-herring penalties). On held-out benchmark scenarios in the training environment, fine-tuned models reach **~76% composite score** (diagnosis, policy compliance, blast-radius, and PR-proposal heads combined) — a **+102% lift** over the base model baseline.

Full pipeline diagram and data flows: **[`docs/architecture.md`](./docs/architecture.md#ai-root-cause-analysis)**.

---

## Incident Triage Environment (OpenEnv)

ServiceLens ships alongside a purpose-built training substrate for autonomous SRE agents:

> **OpenEnv-compliant RL environment for production incident triage** — a multi-app enterprise simulator where an agent must diagnose live production incidents under a step budget, against a dynamic world that changes mid-episode and a 4-head composite grader that scores **process quality, not just final accuracy**.

| Resource | Link |
|---|---|
| Live environment (HF Space) | [huggingface.co/spaces/AbhishekMallick/incident-triage-env](https://huggingface.co/spaces/AbhishekMallick/incident-triage-env) |
| Source (GitHub) | [github.com/deepraj21/Incident-Triage-Env](https://github.com/deepraj21/Incident-Triage-Env/tree/feat/incident-triage-env) |
| Trained adapters (Qwen 1.5B / 3B / 7B) | [HF Hub — incident-triage-grpo-train](https://huggingface.co/AbhishekMallick/incident-triage-grpo-train) |
| Training notebook (Colab) | [Open in Colab](https://colab.research.google.com/drive/10dHOtRzLHY3aMSc21hxQouLxTi_gXv-t) |

### What it simulates

The environment models the full oncall loop — not a static QA benchmark. Six enterprise apps (`alerthub`, `obsly`, `repohub`, `ticketdesk`, `chatops`, `uatsim`) expose a unified action surface over logs, metrics, distributed traces, deploy history, CI gates, on-call paging, and ticket workflows. A `WorldClock` and `EventQueue` evolve the world **mid-episode**: new alerts, deploys, oncall handoffs, and silent metric regressions can fire while the agent is still investigating.

### How it connects to ServiceLens

| Training environment | Production platform (ServiceLens) |
|---|---|
| `obsly.query_logs` / `query_metric` / `get_trace` | HEC log ingest, health probes, sparkline metrics |
| `trace_dependencies` | Topology graph + 1-hop neighbor health in RCA |
| `repohub.recent_commits` / `get_diff` / `open_pr` | GitHub ingestion at a pinned commit + draft fix PRs via the GitHub App |
| `chatops.page_oncall` | Slack + email incident notifications |
| `submit_diagnosis` + blast-radius + PR proposal | Incident RCA markdown + structured fix-PR JSON |
| `PolicyEngine` (change-freeze, UAT bypass, CI gates) | Alert rules, chaos drills, operational runbook memory |

Agents are trained with a two-stage **SFT → GRPO** pipeline on oracle trajectories, then graded by a **4-head composite scorer**:

- **Diagnosis** — root-cause service, category, remediation, evidence coverage
- **Policy** — operational discipline (page before rollback, no PR during freeze)
- **Blast radius** — affected services, regions, request-failure magnitude
- **PR proposal** — target repo, touched files, title/summary quality

Per-step rewards shape investigation quality throughout the episode — not only at terminal submission. Eight scenarios span four difficulty tiers (easy through expert), including stealth regressions, change-freeze violations, UAT bypasses, and CI quality breaches. Seed variants expand the effective training set while preserving ground truth.

ServiceLens applies these trained investigative patterns in production: topology-aware context assembly, evidence-first RCA streaming, and structured remediation output — the path from alert to diagnosed root cause in fewer steps, directly targeting **lower MTTR**.

---

## Integrations

| Integration | Role in ServiceLens |
|---|---|
| **PostgreSQL** (Neon or local) | Primary datastore — architectures, services, health, incidents, audit |
| **OpenRouter** | Streamed RCA and fix-PR generation; rotating key pool with rate-limit fallback |
| **Incident Triage Env** | OpenEnv RL training substrate; SFT/GRPO fine-tuned adapters inform RCA investigative patterns |
| **NextAuth** | Session auth — credentials plus optional GitHub / Google OAuth |
| **Resend** | Transactional email for incident notifications |
| **Slack** | Webhook posts with Block Kit formatting and one-click acknowledge links |
| **GitHub OAuth** | Sign-in provider |
| **GitHub App** | Reads private repos and opens draft fix PRs; install it per repo from the Services tab |
| **GitHub API** | Repo ingestion for topology discovery (tree + files at a pinned commit, no clone) |
| **External cron / worker** | Drives probes, alert rules and the job queue via `/api/cron/tick` on serverless hosts |

Step-by-step credential setup: **[`docs/env_get.md`](./docs/env_get.md)**.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript, React 18 |
| UI | Tailwind CSS generated from `DESIGN.md` tokens (`lib/design-tokens.ts`), Radix primitives, React Flow, Recharts |
| Backend | Next.js Route Handlers, SSE streams, Prisma ORM |
| Database | PostgreSQL |
| Auth | NextAuth (credentials + OAuth) |
| AI | OpenRouter (streaming chat completions) |
| Email | Resend + React Email templates |

---

## Getting started

```bash
git clone https://github.com/Abhishek-Mallick/ServiceLens.git
cd ServiceLens
npm install
cp .env.example .env
# fill DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET — see docs
npm run prisma:push && npm run prisma:seed
npm run dev
```

Sign in with `demo@servicelens.com` / `demo123`.

**Full local setup** — database options, every command, optional integrations, troubleshooting: **[`docs/LOCAL_SETUP.md`](./docs/LOCAL_SETUP.md)**.

**Production deploy** — Vercel, cron wiring, deployment caveats: **[`docs/deploy_vercel.md`](./docs/deploy_vercel.md)**.

---

## Documentation

| Doc | Contents |
|---|---|
| [`docs/LOCAL_SETUP.md`](./docs/LOCAL_SETUP.md) | Local environment, database, commands, demo login |
| [`docs/architecture.md`](./docs/architecture.md) | System design, data flows, RCA pipeline, module reference |
| [`docs/architecture-prompt.md`](./docs/architecture-prompt.md) | Eraser AI prompt for consolidated architecture diagram |
| [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) | **How to use ServiceLens fully:** onboarding, API/CI/agents, rules, paging, RCA, fix PRs, logs, troubleshooting |
| [`docs/secrets.md`](./docs/secrets.md) | Secrets & env vars: what's required, where to get each, how to set them on Vercel |
| [`docs/env_get.md`](./docs/env_get.md) | Longer per-provider walkthroughs for each env value |
| [`docs/deploy_vercel.md`](./docs/deploy_vercel.md) | Production deployment and cron setup |
| [Incident Triage Env](https://github.com/deepraj21/Incident-Triage-Env/tree/feat/incident-triage-env) | OpenEnv RL environment for training incident-response agents |
