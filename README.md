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
| **Discovery** | Service topology | Git-backed clone + analysis; infers frameworks, API contracts, event flows, and dependency edges into an interactive graph with live health overlays |
| **Observability** | Health probes | HTTP/TCP per service; aggregated status, response-time history, sparklines; simulator fallback when endpoints are unreachable |
| **Observability** | Alert rules | JSON DSL (`status_eq`, `p95_latency_gt`, `error_rate_gt`, `consecutive_down`, `regression_failed`); duration windows + auto-resolve |
| **Observability** | Log aggregation | HEC-style bearer-token ingest, search, SSE live tail, synthetic logs correlated with health |
| **Observability** | Regression testing | Flow discovery + contract validation across the service mesh |
| **Reliability** | Incident management | Lifecycle `open → acknowledged → resolved`; dedup, assignment, comments, audit timeline, open-time log snapshot |
| **Reliability** | Runbook memory | Resolution notes from past incidents feed future RCA via keyword-overlap retrieval |
| **Reliability** | Chaos engineering | Scheduled or manual `kill_service` / `degrade` / `latency_spike` to validate detect → incident → RCA end-to-end |
| **AI SRE** | Root-cause analysis | 6-signal context assembly (health, neighbors, logs, regressions, runbook); streamed markdown RCA over SSE |
| **AI SRE** | Fix-PR generation | Structured patch JSON — branch, per-file hunks, PR title/body, blast radius; copy/download or GitHub draft PR |
| **Realtime** | Live updates | Multiplexed SSE — topology pulses, health changes, incident bell; no polling |
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
5. **Act** — **Generate fix PR** runs a follow-up LLM call that outputs a patch-ready JSON diff, optionally opened as a GitHub draft PR.

When the LLM is unavailable, a heuristic fallback still streams so the workflow remains demonstrable.

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
| `repohub.recent_commits` / `get_diff` / `open_pr` | Git analyzer + fix-PR generation |
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
| **GitHub App** | Optional — open draft PRs from the fix-PR flow |
| **Git remotes** | Shallow clone + analyze for topology discovery |
| **External cron / worker** | Drives chaos schedules and background job drain via `/api/cron/tick` |

Step-by-step credential setup: **[`docs/env_get.md`](./docs/env_get.md)**.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript, React 18 |
| UI | Tailwind CSS, shadcn/ui, React Flow, Recharts, Framer Motion |
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
| [`docs/env_get.md`](./docs/env_get.md) | Where every environment variable comes from |
| [`docs/deploy_vercel.md`](./docs/deploy_vercel.md) | Production deployment and cron setup |
| [Incident Triage Env](https://github.com/deepraj21/Incident-Triage-Env/tree/feat/incident-triage-env) | OpenEnv RL environment for training incident-response agents |
