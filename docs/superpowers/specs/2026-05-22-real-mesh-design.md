# ServiceLens — From Simulation to Real Mesh

**Status:** Proposed
**Date:** 2026-05-22
**Scope:** Convert the platform from a demo/simulation into a working multi-tenant SRE system that ingests real GitHub repos, monitors real deployed services, opens real incidents, pages real on-call engineers, and ships real remediations (draft PRs or infra suggestions).

---

## 0. Goals and non-goals

**Goals**
1. A user can onboard a real microservice mesh by adding services with `{ githubRepoUrl, deployedUrl }`. GitHub-hosted only in v1 (Bitbucket / GitLab marked "coming soon" in the UI).
2. ServiceLens derives the topology automatically from real source code, without the user manually drawing edges.
3. Live probes against the real `deployedUrl` drive health, alert rules, and incidents — no simulator fallback when a deployed URL exists.
4. When an incident opens, ServiceLens reads the on-call directory (Google Sheets, published-to-web CSV) and pages the right engineer over email.
5. ServiceLens attempts remediation in the background: either a **draft PR** on the affected repo (code fix) or an **infra suggestion card** in the UI (infra fix).
6. Architecture page UI is reworked so the live topology graph is the centerpiece.

**Non-goals (deferred)**
- Bitbucket / GitLab providers (stub the enum, render "coming soon").
- Real metrics ingestion (Prometheus, OTLP). Probes + HEC-style logs remain the data sources.
- Auto-merging PRs. Bot never merges; humans do.
- Paging via PagerDuty / Opsgenie. Email-only in v1 (existing Slack channel still works).
- Schema migrations across providers — staying on Postgres / Prisma.

---

## 1. Architecture overview

```
┌──────────────────┐   GitHub Contents API   ┌──────────────────────┐
│  User onboards   │ ───────────────────────▶│ lib/ingest/          │
│  service: repo + │                          │  github-contents.ts  │
│  deployedUrl     │                          │  extract-endpoints.ts│
└────────┬─────────┘                          │  extract-deps.ts     │
         │                                    └──────────┬───────────┘
         │ writes Service + ServiceContract              │
         ▼                                               ▼
┌──────────────────┐                          ┌──────────────────────┐
│  Service row     │                          │ lib/topology/        │
│  + Contract row  │ ◀────── reconcile ─────▶ │   from-contracts.ts  │
└────────┬─────────┘                          └──────────────────────┘
         │ deployedUrl
         ▼
┌──────────────────┐  on rule trip   ┌──────────────────────┐
│ lib/probes (real │ ─────────────▶  │ lib/incidents        │
│ HTTP to live URL)│                 │   openIncident()     │
└──────────────────┘                 └──────────┬───────────┘
                                                │ assign + notify
                                                ▼
                                     ┌──────────────────────┐
                                     │ lib/oncall/          │
                                     │  sheet-csv.ts        │
                                     │  assign.ts           │
                                     └──────────┬───────────┘
                                                │ enqueue
                                                ▼
                                     ┌──────────────────────┐
                                     │ lib/remediation/     │
                                     │  classify.ts (LLM)   │
                                     │  code-fix.ts (PR)    │
                                     │  infra-suggest.ts    │
                                     └──────────────────────┘
```

Realtime SSE bus, alert-rule engine, notify providers, and incident lifecycle stay unchanged in shape — we add new producers/consumers.

---

## 2. Data model changes

All new fields are additive; nothing existing is dropped.

```prisma
// New: per-service GitHub provider + deployed URL + extracted contract
model Service {
  // existing fields...
  provider        String   @default("github")        // "github" | "bitbucket" | "gitlab" — only "github" implemented
  deployedUrl     String?                            // e.g. https://ecommerce-gateway.vercel.app
  contract        ServiceContract?
}

// New: persisted extraction result. One row per service.
model ServiceContract {
  id              String   @id @default(cuid())
  serviceId       String   @unique
  service         Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  endpoints       String   // JSON: Endpoint[]  { method, path, file, line, handlerName? }
  outboundDeps    String   // JSON: OutboundDep[] { envVar, urlExample?, targetServiceHint?, file, line }
  envVars         String   // JSON: { name, defaultValue? }[]  — from .env.example
  framework       String?  // express | nextjs-app | nextjs-pages | fastify | unknown
  commitSha       String?  // sha at time of extraction (HEAD of branch)
  extractedAt     DateTime @default(now())
}

// New: per-architecture oncall source
model OncallSource {
  id              String   @id @default(cuid())
  architectureId  String   @unique
  architecture    Architecture @relation(fields: [architectureId], references: [id], onDelete: Cascade)
  kind            String   @default("google_sheet_csv")  // future: "manual" | "opsgenie"
  csvUrl          String                                  // published-to-web CSV URL
  lastFetchedAt   DateTime?
  lastError       String?
  rosterJson      String?                                // JSON cache: { service_name -> { name, email, escalationEmail? } }
}

// New: link an incident to its on-call assignment (separate from Incident.assigneeId
// which is a ServiceLens user; oncall may be a non-user email).
model IncidentOncallAssignment {
  id              String   @id @default(cuid())
  incidentId      String   @unique
  incident        Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  name            String
  email           String
  escalationEmail String?
  source          String   // "google_sheet_csv" | "manual"
  at              DateTime @default(now())
}

// New: structured remediation output
model Remediation {
  id              String   @id @default(cuid())
  incidentId      String
  incident        Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  kind            String   // "code_pr" | "infra_suggestion"
  status          String   // "pending" | "in_progress" | "success" | "failed" | "skipped"
  classification  String   // LLM verdict: "code" | "infra" | "unknown"
  classificationReason String?
  prUrl           String?  // when kind=code_pr
  prBranch        String?
  prTitle         String?
  diffJson        String?  // structured fix-pr output (existing shape)
  infraTitle      String?  // when kind=infra_suggestion: "Increase Cart Service memory to 512MB"
  infraBody       String?  // markdown rationale + steps
  error           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([incidentId, kind])
}

// New: org-level GitHub App installation cache
model GithubInstallation {
  id              String   @id @default(cuid())
  installationId  Int      @unique             // from GitHub
  accountLogin    String                         // org or user login
  accountType     String                         // "Organization" | "User"
  createdById     String?                        // ServiceLens user who linked it
  repos           String                         // JSON: { fullName, defaultBranch }[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// Architecture-level binding to an installation (so we know which token to mint
// when opening a PR against a service in this arch).
model Architecture {
  // existing...
  githubInstallationId Int?                      // FK by GitHub's id, nullable
}
```

`Service.simulated` stays — set `false` when `deployedUrl` is non-null and at least one real probe has run.

---

## 3. Sub-project 1 — Real GitHub ingestion (Contents API)

**Decision (per user input):** No `git clone`. Use the GitHub REST API (Trees + Contents) to read files directly. Works in Vercel serverless (no git binary), no disk usage, no SSRF surface beyond `api.github.com`.

**Module layout**
```
lib/ingest/
  github-client.ts        // octokit wrapper, app-installation auth
  github-contents.ts      // listTree(repo), readFile(repo, path) — paginated, size-capped
  extract-endpoints.ts    // regex extractor for Express + Next.js routes
  extract-deps.ts         // regex extractor for env-based outbound deps
  ingest-service.ts       // orchestrator: tree → filter → extract → persist Contract
  patterns.ts             // shared regexes (single source of truth)
```

**Extraction rules (v1, regex-first)**

1. **Files of interest** — by extension `.js .ts .mjs .cjs .tsx` and path heuristics: anything under `src/routes`, `app/api`, `pages/api`, `api/`, root `*.js`/`*.ts`. Skip `node_modules`, `.next`, `dist`, `build`, `coverage`, lockfiles. Size cap 200 KB per file, 200 files per repo.

2. **Endpoints — Express**
   - Regex: `\b(app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"\`]([^'"\`]+)['"\`]`
   - Captured as `{ method: GET, path: "/api/auth/login", file, line }`.

3. **Endpoints — Next.js App Router**
   - File-system: any `app/**/route.{ts,js}` → exports `GET|POST|PUT|PATCH|DELETE` → path = directory path with `[seg]` segments converted to `:seg`.
   - Regex on file: `export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)`.

4. **Endpoints — Next.js Pages Router** — `pages/api/**/*.{ts,js}` → method via `req.method === 'POST'` switch; default `ANY`.

5. **Outbound deps — env URL convention**
   - In any source file: `process\.env\.([A-Z0-9_]+_(?:URL|ENDPOINT|HOST))`
   - In `.env.example`: same regex on RHS values too.
   - Captured: `{ envVar: "PRODUCT_SERVICE_URL", urlExample: "http://localhost:4003", file, line }`.

6. **Framework detection** — `package.json` deps: `express` ⇒ `express`; `next` + `app/` dir ⇒ `nextjs-app`; `next` + `pages/api` ⇒ `nextjs-pages`; `fastify` ⇒ `fastify`; else `unknown`.

7. **LLM enrichment (optional, gated by `OPENROUTER_API_KEYS`)** — single call passes the candidate endpoints + outbound deps + README slice → LLM returns `{ summary, producesEvents?, consumesEvents?, databases? }`. Heuristic fallback if no keys.

**Auth** — GitHub App installation token (see §7). For public repos in v1 we can also fall back to unauthenticated calls subject to 60 req/hr/IP; ingest with an installation token whenever the arch is linked to one.

**API**
- `POST /api/architectures/:id/services` body adds `deployedUrl`, defaults `provider: "github"`.
- `POST /api/services/:id/analyze` — replaces the existing clone+analyze pipeline. Idempotent: re-running updates the `ServiceContract` row and `commitSha`.

**Testing** — Vitest fixtures: a `tests/fixtures/repos/` directory containing the actual files from the 7 ecommerce repos (committed once, not fetched live), assert extracted endpoints/deps match expected snapshots.

---

## 4. Sub-project 2 — Auto-topology from contracts

**`lib/topology/from-contracts.ts`** consumes all `ServiceContract` rows for an architecture and outputs `{ nodes, edges }`:

1. **Node per service** — id = `Service.id`, label = `Service.name`, status from `Service.healthStatus`.
2. **Edge derivation** — for each service `A` with `outboundDeps`, for each dep `{ envVar, urlExample }`:
   - **Strategy A — env-name match.** If exactly one other service `B` in the arch has a name whose tokens match the env var stem (e.g. `PRODUCT_SERVICE_URL` ↔ service named `product` / `product-service` / `ecommerce-product-service`), draw `A → B` with `type: "rest"`, `details: { envVar, matchedBy: "envName" }`.
   - **Strategy B — deployed URL match.** If `urlExample` host equals (or its localhost port matches the convention) the `deployedUrl` host of `B`, also a match. Reads from production `.env` values when uploaded; for v1 we use the `.env.example` `localhost:4003`-style hints + the convention port-suffix table.
   - **Strategy C — ambiguous → highlight.** Show as a dashed edge with a hover tooltip listing the candidates. User can confirm in the UI (writes a `ServiceDependency` row with `type: "rest"` and `details: { envVar, confirmedBy: userId }`).
3. **Persist** — write `ServiceDependency` rows for confirmed edges. Cache the React Flow graph JSON on `Architecture.topologyData` (already exists).
4. **Re-derivation** — runs automatically on every `analyze` and when a service is added/removed.

The topology becomes the hero of the architecture page (see §9). React Flow node component reads live health status from the existing SSE channel and pulses on `chaos`/`incident_opened` events (already wired).

---

## 5. Sub-project 3 — Real probing + incident firing

**`lib/probes.ts` changes**
- If `Service.deployedUrl` is set: probe URL defaults to `${deployedUrl}/health` (with `/health` overridable per-probe via existing `Probe.target`). Real HTTP. Real status/latency.
- If `deployedUrl` is null: existing simulator path runs (so the demo seed still works).
- `Service.simulated` set to `false` on first successful real probe.
- Probe a service at most `intervalSec` (already enforced by Probe row).

**Default probes** — when a service is created with a `deployedUrl`, auto-create one `http` Probe targeting `/health` at 60 s interval. The user's ecommerce services all expose `/health` returning `{ status: "ok" }` so this works out of the box.

**Default alert rules** — when an architecture is created (or first probed) and no rules exist, seed three:
1. `consecutive_down` ≥ 3 → severity `critical`.
2. `p95_latency_gt` 2000 ms over 5 min → `warning`.
3. `error_rate_gt` 0.2 over 5 min → `critical`.

**Incident wiring** — already done in `lib/incidents.ts#openIncident`. New hook: after open, **enqueue an `oncall_assign` job** and a **`remediation` job** (see §6, §7).

---

## 6. Sub-project 4 — Oncall directory + email assignment

**Sheet format (documented in `docs/oncall.md`)**

| service_name              | oncall_name | oncall_email          | escalation_email     |
|---------------------------|-------------|-----------------------|----------------------|
| ecommerce-gateway         | Alice Liu   | alice@example.com     | sre-lead@example.com |
| ecommerce-auth-service    | Bob Khan    | bob@example.com       | sre-lead@example.com |

`service_name` matches `Service.name` case-insensitively, with `-service` stripped on both sides for forgiving matching.

**`lib/oncall/sheet-csv.ts`**
- `fetchRoster(csvUrl)` — `fetch(csvUrl)` → CSV parse (tiny inline parser, no dep). Validates the four columns. Returns map. Caches in `OncallSource.rosterJson` with `lastFetchedAt`.
- Cron: `app/api/cron/tick` already drains jobs every minute; we add a `oncall_refresh` job enqueued by `tick` for each arch whose `lastFetchedAt` is > 5 min old.

**`lib/oncall/assign.ts`**
- `assignForIncident(incidentId)` — load the affected service, look up the roster, write `IncidentOncallAssignment` row, write a `IncidentEvent { type: "assigned" }`, enqueue email notification.
- Email uses the existing Resend provider (`lib/notify/email/`), new template `IncidentAssignedToOncall` (React Email): subject `[ServiceLens] {{severity}} — {{service}} {{title}}`, body with magic-link ack button (`lib/notify/tokens.ts` already supports this; we just pass the oncall's email as recipient even if they're not a ServiceLens user).

**Settings UI** — Architecture Settings page gets an "On-call directory" card: paste CSV URL, Test fetch, see the parsed roster table inline, save.

---

## 7. Sub-project 5 — Auto-remediation worker

**Trigger** — on `incident.opened`, `lib/jobs.ts.enqueue("remediation", { incidentId })`.

**`lib/remediation/classify.ts`** — single LLM call. Prompt assembles:
- Incident `title`, `summary`, rule that fired (`condition` JSON), severity.
- Service `name`, `framework`, `deployedUrl`.
- 1-hop neighbor health snapshot (already produced by `lib/logs.ts#snapshotForIncident`).
- Last 50 log lines for the service.
- Returns strict JSON: `{ classification: "code" | "infra" | "unknown", reason: string, codeHints?: string[], infraTitle?: string, infraBody?: string }`. Heuristic fallback if no LLM key: `consecutive_down + 5xx body` → `code`; `latency_spike OR p95_latency_gt` → `infra`; else `unknown`.

**`lib/remediation/code-fix.ts`** — when `classification === "code"`:
1. Run existing `lib/fix-pr.ts` (already produces `{ branchName, files[], prTitle, prBody, diff }`).
2. Acquire installation token for the service's repo (`lib/ingest/github-client.ts`).
3. Octokit: read each `files[].path` → compute new content (apply the patch) → `git-data` API: create blob → tree (with base = repo HEAD) → commit → ref `refs/heads/{branchName}`.
4. `pulls.create({ draft: true, base: defaultBranch, head: branchName, title: prTitle, body: prBody + "\n\n— Linked to incident " + incidentUrl })`.
5. Write `Remediation { kind: "code_pr", status: "success", prUrl, prBranch, ... }`. Emit realtime event `remediation_ready` (new event type).

**`lib/remediation/infra-suggest.ts`** — when `classification === "infra"`:
1. No PR. Write `Remediation { kind: "infra_suggestion", status: "success", infraTitle, infraBody }`.
2. The incident page surfaces this as a card visible only to the assigned oncall (server-side gate on email match for non-user oncalls, userId match for ServiceLens users).

**Safety**
- Bot **never merges**. Draft PR only.
- Bot **only writes to branches it created** (prefix `servicelens/incident-{id}-{shortHash}`).
- Bot writes only to repos in `GithubInstallation.repos` linked to this arch.
- Per-incident lock — a `Remediation` row in `pending`/`in_progress` prevents a second job from running for the same incident.
- Rate-limit: ≤ 1 PR per repo per hour.

**GitHub App setup**
- One-time: register a GitHub App "ServiceLens" with permissions `contents: read+write`, `pull_requests: read+write`, `metadata: read`. Set callback `/api/github/app/callback`. Env: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`.
- User flow: from Architecture Settings → "Connect GitHub" → redirect to install URL → callback persists `GithubInstallation` row + binds it to the arch (`Architecture.githubInstallationId`).
- Token minting: JWT signed with the private key → `POST /app/installations/{id}/access_tokens` → 1-hour token, cached in-process.

---

## 8. Sub-project 6 — Topology-first UI rework

**Current state** — Architecture page (`app/(dashboard)/architectures/[id]/page.tsx`) shows summary cards + a smallish topology widget; Topology is a separate sub-route.

**New** — collapse the architecture detail into a single page:

```
┌─────────────────────────────────────────────────────────────┐
│ Header: arch name, status pill, [Trigger Incident] [⌘K]    │
├──────────────────────────────────────────────┬──────────────┤
│                                              │ Side rail    │
│         FULL-BLEED LIVE TOPOLOGY             │ ┌──────────┐ │
│         (React Flow, dagre layout)           │ │ Incidents│ │
│         - nodes pulse on health change       │ │  (open)  │ │
│         - edges show RPS / latency stub      │ ├──────────┤ │
│         - click a node → opens drawer        │ │ On-call  │ │
│                                              │ │ today    │ │
│                                              │ ├──────────┤ │
│                                              │ │ Recent   │ │
│                                              │ │ events   │ │
│                                              │ └──────────┘ │
├──────────────────────────────────────────────┴──────────────┤
│ Bottom tabs: Probes · Alert rules · Logs · Regression · Chaos│
└─────────────────────────────────────────────────────────────┘
```

- Topology occupies the viewport hero. Nodes render service name + framework chip + status dot.
- Right rail is 320 px sticky, scroll inside. Open incidents are clickable → opens detail drawer (no nav).
- Clicking a node opens a service drawer (slide from right) showing endpoints (from `ServiceContract.endpoints`), outbound deps, last 10 health, last 50 logs.
- The current sub-routes (`/topology`, `/health`, `/incidents`, etc.) stay reachable but the architecture root is now the consolidated view.

Editorial style (Resend dark, Fraunces headlines) preserved per `DESIGN.md`.

---

## 9. API additions

```
POST   /api/github/app/callback           — installation callback
GET    /api/architectures/:id/oncall      — current roster (cached)
POST   /api/architectures/:id/oncall      — set csvUrl (validated, test-fetched)
POST   /api/architectures/:id/oncall/refresh — manual re-pull
POST   /api/services/:id/contract/refresh — re-extract contract from latest commit
GET    /api/incidents/:id/remediation     — fetch Remediation row(s) for the incident
POST   /api/incidents/:id/remediation/retry — re-run remediation job (oncall only)
```

`POST /api/architectures/:id/services` body extends:
```ts
{ name, repoUrl, deployedUrl?, provider?: "github" | "bitbucket_soon" | "gitlab_soon", branch? }
```

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Regex extractor misses non-conventional routes | Fixture tests on real repos; LLM enrichment fills gaps; user can manually add endpoints via service drawer. |
| GitHub API rate limits | App installation tokens give 5k req/hr/installation; we cache trees + only re-extract on `analyze`. |
| Sheet-CSV roster stale | 5-min refresh + manual "Refresh" button; show `lastFetchedAt` in the UI. |
| Bad LLM JSON for classify/fix | Existing `lib/fix-pr.ts` already validates with zod and falls back; classify uses same pattern. |
| Bot opens noisy PRs | Draft-only, 1/hr/repo rate limit, linked back to incident, oncall can disable per-arch with one toggle. |
| Email to non-user oncall | Resend handles arbitrary recipients; magic-link ack uses signed JWT with `incidentId + email` claims (already implemented for arch members). |
| Vercel serverless can't run `git clone` | We switched to GitHub Contents API per user requirement — no git binary needed. |

---

## 11. Build order

Execute strictly in this order. Each sub-project ships green tests before the next starts.

1. **SP1 — Ingestion** (foundation). Schema migration, GitHub Contents client, extractors, fixture tests on the 7 real repos.
2. **SP2 — Auto-topology**. Reconciler + React Flow update.
3. **SP3 — Real probing**. Drop simulator when `deployedUrl` exists; default probes/rules.
4. **SP4 — Oncall + email**. Sheet CSV, assignment, Resend template.
5. **SP5 — Remediation**. GitHub App, classify, code-fix worker, infra-suggest writer.
6. **SP6 — Topology-first UI rework**. The big visual refactor; everything else already feeds it.

---

## 12. Acceptance — golden path

After the work is shipped, this is the demo that proves it:

1. New user signs up, creates architecture "E-Commerce Real".
2. Clicks "Connect GitHub" → installs ServiceLens App on `buildlab-devs`.
3. Adds 7 services with `{ repoUrl, deployedUrl }` for the real ecommerce repos.
4. Clicks "Analyze" → contracts extracted (~10 s/service), topology renders the 7-node mesh with gateway → 5 downstream edges all auto-derived.
5. Pastes a Google-Sheet CSV URL with the oncall roster → table renders inline.
6. Hits `/api/architectures/:id/health` → real probes hit Vercel URLs.
7. Manually break a deployed service (or use chaos drill against a dummy `/health` shim) → consecutive_down rule trips → Incident opens → assignment job pages the right oncall via email with magic-link ack.
8. Remediation worker classifies and (if code) opens a draft PR on the affected repo; the PR URL appears on the incident page.
9. Oncall clicks magic-link, acknowledges, reviews the PR, marks resolved.
