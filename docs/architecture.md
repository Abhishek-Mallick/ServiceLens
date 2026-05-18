# Architecture map

A one-page reference for what every `lib/` module owns. Each module is unit-testable in isolation; API routes (`app/api/**`) are thin handlers that call into these.

## Data flow

```
┌─────────────┐    POST /chaos-now      ┌──────────────┐
│  UI / API   │───────────────────────▶ │  lib/chaos   │
└─────────────┘                          └──────┬───────┘
       ▲                                        │ applyChaos
       │ SSE                                    ▼
┌──────┴───────┐                          ┌─────────────────┐
│ realtime bus │ ◀── publish('chaos')──── │ writes Health + │
│ (in-proc)    │     publish('health')    │ openIncident()  │
└──────┬───────┘                          └────────┬────────┘
       │ subscribe                                 │
       ▼                                           ▼
 ┌─────────────────┐   probe loop      ┌──────────────────────┐
 │ /events SSE     │ ─── publish ───── │ lib/probes           │
 │ (per-arch)      │                   │   → recordHealth     │
 └─────────────────┘                   │   → evaluateRules    │
                                       └──────────┬───────────┘
                                                  │ opens
                                                  ▼
                                       ┌──────────────────────┐
                                       │ lib/incidents        │
                                       │   ├ snapshotForIncident
                                       │   ├ dispatch (notify)
                                       │   └ publish('incident_*')
                                       └──────────┬───────────┘
                                                  │ on RCA-button
                                                  ▼
                                       ┌──────────────────────┐
                                       │ lib/rca → openrouter │
                                       │ lib/fix-pr           │
                                       └──────────────────────┘
```

## `lib/` module map

| Module | Owns | Tested in |
|---|---|---|
| `prisma.ts` | Singleton Prisma client | — |
| `auth.ts` | NextAuth config (credentials + GitHub + Google) | — |
| `auth-helpers.ts` | Membership-aware `requireOwned*()` guards for route handlers | indirectly via E2E |
| `membership.ts` | Role ranking (`owner / editor / viewer`), invite / setRole / remove, self-heal for legacy creators, `listForUser()` | `tests/membership.test.ts` |
| `audit.ts` | Append-only `AuditEvent` writer + IP/UA extractor | — |
| `utils.ts` | `cn`, `parseJson<T>`, `stringify`, `formatRelative` | — |
| `types.ts` | Cross-cutting type aliases | — |
| `realtime.ts` | In-process pub/sub bus (`globalThis`-cached EventEmitter); `publish()` / `subscribe()` per architecture | indirectly via E2E |
| `jobs.ts` | `Job` table queue with retry/backoff; `registerHandler` / `enqueue` / `drain` / `startWorkerLoop` | — |
| `git-analyzer.ts` | URL validator (SSRF guard) + sandboxed shallow clone + 50 MB size cap + 30s timeout + key-file extractor | `tests/membership.test.ts` (URL validator) |
| `code-analyzer.ts` | Heuristic framework detection per language | `tests/code-analyzer.test.ts` |
| `openrouter.ts` | One-shot OpenRouter calls (analyze service / discover flows / summarize regression) with heuristic fallback | — |
| `openrouter-stream.ts` | Streaming chat-completions (async generator) + non-streaming `chatOnce`; 429/5xx auto-fall-back to heuristic | indirectly via RCA tests |
| `topology-builder.ts` | Service → React Flow graph + `ServiceDependency` derivation | `tests/topology-builder.test.ts` |
| `architecture-templates.ts` | Phase 5 starter templates (Blank / E-commerce / SaaS / Streaming) | — |
| `health-monitor.ts` | Real HTTP probe + deterministic simulator + `recordHealth()` + emits `health` on realtime | `tests/health-monitor.test.ts` |
| `probes.ts` | Multi-probe-per-service aggregator (http/tcp/ping), `probeService()` falls back to simulator, kicks `evaluateRulesForService` | — |
| `alert-rules.ts` | Pure `evaluate(condition, ctx)` + runtime `evaluateRulesForService()` (forDuration / auto-resolve) | `tests/alert-rules.test.ts` |
| `incidents.ts` | Lifecycle helpers (`openIncident` with dedup, `ackIncident`, `resolveIncident`, `commentOnIncident`, `triggerSyntheticIncident`) + log snapshot + dispatch + realtime emit | E2E |
| `logs.ts` | HEC-style ingest, search, `snapshotForIncident` (1-hop neighbors), token generator | `tests/logs.test.ts` |
| `log-generator.ts` | Deterministic synthetic log generator (status-biased error rate) | `tests/logs.test.ts` |
| `regression-engine.ts` | Flow discovery + execution (mocked outcomes; flag stays `simulated: true`) | `tests/topology-builder.test.ts` indirectly |
| `rca.ts` | Prompt assembly (incident + health window + neighbors + logs + failed regressions + runbook RAG) + `streamRcaInto` | `tests/rca-fixpr.test.ts` |
| `fix-pr.ts` | Second-pass LLM call with structured JSON output + zod validation + patch renderer | `tests/rca-fixpr.test.ts` |
| `chaos.ts` | Schedule grammar (`every Nm/h/s` \| `HH:MM`), `isDue`, action runtime (`kill_service / degrade / latency_spike`), `runDueSchedules` | `tests/chaos.test.ts` |
| `notify/` | Provider abstraction (`inapp / email / slack / console`), `dispatch()` per arch routing, JWT magic-link ack | `tests/notify-tokens.test.ts` |
| `hooks/use-architecture-events.ts` | Client SSE subscriber with exponential reconnect | E2E |

## API route map

```
/api/auth/[...nextauth]                 NextAuth
/api/architectures                      GET (list via membership) / POST (create + owner-membership)
/api/architectures/:id                  GET / DELETE
/api/architectures/:id/services         POST
/api/architectures/:id/topology         GET
/api/architectures/:id/analyze          POST (clone + analyze every service)
/api/architectures/:id/health           GET / POST (probeArchitecture)
/api/architectures/:id/regression       GET / POST
/api/architectures/:id/regression/:run  GET
/api/architectures/:id/incidents        GET
/api/architectures/:id/alert-rules      GET / POST
/api/architectures/:id/synthetic-incident POST
/api/architectures/:id/chaos-schedules  GET / POST
/api/architectures/:id/chaos-now        POST
/api/architectures/:id/logs             GET (search)
/api/architectures/:id/logs/tail        SSE
/api/architectures/:id/logs/generate    POST (synthetic burst)
/api/architectures/:id/events           SSE (multiplexed realtime)
/api/architectures/:id/members          GET / POST / PATCH / DELETE  (owner-only mutations)
/api/architectures/:id/audit            GET
/api/architectures/:id/settings         PATCH (slackWebhookUrl, notificationsEmail)

/api/services/:id/probes                GET / POST
/api/probes/:id                         PATCH / DELETE / POST (run-now)
/api/services/:id/logs                  POST (HEC-style, bearer token)
/api/services/:id/ingest-token          GET / POST (rotate)

/api/incidents/:id                      GET
/api/incidents/:id/ack | resolve | assign | comment   POST
/api/incidents/:id/rca                  POST (SSE)
/api/incidents/:id/fix-pr               GET / POST

/api/alert-rules/:id                    PATCH / DELETE
/api/chaos-schedules/:id                PATCH / DELETE
/api/notifications                      GET / POST (mark all read)
/api/notifications/:id/read             POST
/api/me/notification-pref               GET / PUT
/api/notify/ack                         GET (magic link)
/api/search                             GET (palette)
/api/cron/tick                          GET / POST (external scheduler entry)
```

## Phase-by-phase what shipped

See the top of the codebase: `implementation_plan.md` (the original eight-phase plan) and `README.md` (status). All eight phases are merged on this branch.
