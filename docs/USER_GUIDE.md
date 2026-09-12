# ServiceLens user guide

How to get the most out of ServiceLens, from first login to automatic fix PRs. For setup and secrets, see [`secrets.md`](./secrets.md). For what's built and what's next, see [`STATUS.md`](./STATUS.md).

---

## 1. The model in one minute

| Thing | What it is |
|---|---|
| **Architecture** | A group of services you monitor together, with its own members, alert rules, on-call directory and API keys. |
| **Service** | One deployable with a **GitHub repo** and, ideally, a **deployed URL**. |
| **Contract** | What ServiceLens learned from the repo: HTTP endpoints, the env vars it calls other services through, the framework, and the commit it read. |
| **Topology** | Service → service edges derived from contracts (`ORDERS_SERVICE_URL` in *checkout* → *orders*). |
| **Probe** | A health check. HTTP/TCP probes are run by ServiceLens; a **heartbeat** is pushed by the service itself. |
| **Alert rule** | When to open an incident (service down, latency, error rate…). |
| **Incident** | One outage of one service: who was paged, the timeline, the RCA, the fix PR. |
| **On-call directory** | A Google Sheet saying who to page for which service. |
| **Demo** | The seeded *E-Commerce Platform*, shared read-only with everyone. It's the only place with simulated data. |

---

## 2. Quick start (≈15 minutes)

1. **Sign up** and open the **E-Commerce Platform** demo to see a live mesh, incidents, RCA and topology. It's read-only for you.
2. **Architectures → New**. Name it, then add one row per service:
   - **GitHub repo**, e.g. `https://github.com/acme/orders`. The service name fills in from it.
   - **Deployed URL**, e.g. `https://orders.acme.com`, plus a **health path** (default `/health`; any 2xx means healthy).
   - Leave the URL empty for services ServiceLens can't reach, and use heartbeats instead (§4).
3. **Create & analyze**. ServiceLens reads each repo and draws the dependency graph. Open **Topology** to check the edges.
4. You now have, with no further setup:
   - a health check on every deployed URL every **60 s**
   - three alert rules: **Service down** (3 failed checks), **High latency** (>2 s for 3 min), **Elevated error rate** (>20 % for 2 min)
5. **Alerts** tab:
   - **On-call directory**: paste your sheet's CSV URL (§6).
   - **Notification routing**: a Slack incoming webhook and/or a team email alias.
   - **Automatic fix PRs**: switch this on once the GitHub App is installed on your repos (§7).
6. **Settings** (your profile): which severities email you, and quiet hours.

---

## 3. Teams and roles

Invite people from the architecture's **Members** settings. They need a ServiceLens account first.

| Role | Can |
|---|---|
| **Viewer** | See everything, get in-app alerts, comment on incidents |
| **Editor** | + add/edit services and probes, edit rules, acknowledge/resolve incidents, generate RCA and fix PRs, and get incident **emails** |
| **Owner** | + members, notification routing, on-call directory, auto fix PRs, API keys, delete the architecture |

---

## 4. Onboarding at scale: API, CI, agents

### API keys
**Services → API keys → Create key** (owners). The key starts with `slk_`, is shown **once**, and is scoped to that one architecture. Revoke it from the same panel.

### Register or update a service (idempotent)
```bash
curl -X PUT "$SERVICELENS_URL/api/v1/services/orders" \
  -H "Authorization: Bearer $SERVICELENS_API_KEY" -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/acme/orders","deployedUrl":"https://orders.acme.com"}'
```
Run it from every deploy (a CI step). It creates the service the first time, updates it after that, and re-reads the repo in the background.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/architecture` | Verify the key; list services with health and analysis status |
| `PUT /api/v1/services/{name}` | Register or update (`repoUrl`, `branch`, `deployedUrl`, `healthPath`, `analyze`) |
| `GET /api/v1/services/{name}` | One service plus its open incidents |
| `DELETE /api/v1/services/{name}` | Remove a service |
| `POST /api/v1/services/{name}/heartbeat` | Push health (below) |
| `GET /api/v1/incidents?status=open` | What's broken right now, who's paged, any fix PR |

### Let an AI agent onboard everything
Point Claude Code (or any agent) at **`$SERVICELENS_URL/SKILL.md`** and say *"Onboard all our services to ServiceLens."* The skill tells the agent how to find services in your repos and deploy configs, register each one, ask you for any URL it can't find, and report back.

### Services on private networks: heartbeats
If ServiceLens can't reach a service, have the service call this every `intervalSec` seconds:
```bash
curl -X POST "$SERVICELENS_URL/api/v1/services/ledger/heartbeat" \
  -H "Authorization: Bearer $SERVICELENS_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"healthy","intervalSec":60}'
```
If beats stop for **2 × intervalSec**, the service is marked **down** and paging works as normal. `status` can also be `degraded` or `down`.

---

## 5. Monitoring

**Dependency review** (Services tab and each service page). Analysis matches env vars like `PAYMENTS_SERVICE_URL` to services. When it can't be sure:
- **Ambiguous** (several services match): pick the right one, or mark it external.
- **Not matched** (no service matches): link it to a service, mark it external (e.g. `STRIPE_API_URL`), or register the missing service.
- **Add a dependency by hand** when the code doesn't make it visible.

Decisions are kept across re-analysis and can be undone. Ambiguous edges are drawn dashed on the topology.

**Service page** has three more cards:
- **Repository analysis**: every endpoint and outbound dependency with a link to the exact line on GitHub, and whether the GitHub App covers the repo.
- **Service settings**: edit the name, repo, branch, deployed URL and health path; **Re-analyze repo**; delete the service.
- **Dependency review** for just that service.

**Probes** (service page → Probes):
- **HTTP**: a URL, an expected status (or any 2xx), an optional body regex, and headers (e.g. an auth header for a protected health route; stored encrypted)
- **TCP**: `host:port`
- **PostgreSQL**: a connection string (`postgres://user:pass@host:5432/db?sslmode=require`); runs `SELECT 1`. Use a read-only user.
- **Redis**: `redis://` or `rediss://` URL with the password; runs `AUTH` + `PING`.
- Connection strings are **encrypted at rest**; the UI and API only ever show a redacted copy.
- The default probe follows the service's deployed URL and health path automatically.
- Private or internal addresses are refused on hosted deployments (SSRF protection). Self-hosters can set `ALLOW_PRIVATE_PROBES=1`.

**Rules** (Alerts tab) are built from:

| Condition | Fires when |
|---|---|
| `status_eq` | Latest check has a given status |
| `consecutive_down` | The last N checks were all down |
| `p95_latency_gt` | p95 latency over the window is above a threshold |
| `error_rate_gt` | The share of non-healthy checks over the window is above a threshold |

- **Window:** how much history the condition looks at.
- **For:** the condition must stay true **continuously** this long before an incident opens, so one bad check never pages anyone.
- **Auto-resolve:** when the condition has been clear for 2 × the window.
- **Channels:** in-app always; add email and Slack per rule.
- **One outage, one incident:** while a service has an open incident, other rules that fire for it are attached to it (and can raise its severity) instead of paging again.

---

## 5b. Contract tests (regression)

**Regression** tab on your architecture. ServiceLens calls every **GET route found in each service's code** on its deployed URL:

| Result | Meaning |
|---|---|
| 2xx / 3xx, 401 / 403 / 429 | Pass (the route exists; 401/403 just means it's protected) |
| 404 / 405 | Fail: the code defines the route but the deployment doesn't serve it (**deploy drift**, or a wrong base URL) |
| 5xx, timeout | Fail |

Only safe routes without path parameters are called (`/api/orders` yes, `/api/orders/:id` no); the panel lists what's skipped and why. Run it:
- **Now**, from the Regression tab
- **On a schedule**: hourly, every 6 hours, or daily (owners)
- **From CI after every deploy**:
  ```bash
  curl -fsS -X POST "$SERVICELENS_URL/api/v1/contract-tests" -H "Authorization: Bearer $SERVICELENS_API_KEY" | tee result.json
  test "$(jq .failed result.json)" -eq 0   # fail the pipeline on drift
  ```

A `regression_failed` alert rule can open an incident when a run fails.

---

## 6. Incidents and paging

**The on-call directory** is a Google Sheet published to the web (*File → Share → Publish to web → CSV*):

```
service_name,oncall_name,oncall_email,escalation_email
orders,Alice Liu,alice@acme.com,sre-lead@acme.com
*,Platform On-call,platform@acme.com,
```
- Names match loosely: `Orders Service` = `orders-service` = `orders`.
- `*` covers every service without its own row.
- **Escalate after (min)** pages `escalation_email` if nobody acknowledges; 0 turns it off.
- **Save & test** validates the sheet and warns about services nobody covers.

**When an incident opens:**

| Who | How |
|---|---|
| The on-call engineer for that service | Email with an **Acknowledge** button. They don't need an account. |
| Owners and editors | Email, if the rule has email on and it passes their severity and quiet-hours prefs |
| Everyone in the architecture | In-app bell |
| Your Slack channel | If configured and the rule has Slack on |
| Escalation contact | After N minutes unacknowledged |

- **Acknowledge** from the email or the incident page; acknowledging stops escalation. Email links open a confirmation page first, so mail scanners can't auto-acknowledge.
- **Resolve** with a short *what fixed it* note. Notes are reused as **runbook memory** in future RCAs for the same service.
- Incidents also auto-resolve when their rule clears.

---

## 7. AI: root-cause analysis and fix PRs

**RCA** is generated automatically when an incident opens and is on the incident page when you arrive. It's built from:
- the last 30 min of health checks
- the health of neighbouring services
- logs captured at open time (§8)
- recent failed checks
- how similar past incidents were fixed

**Fix PRs:**
1. ServiceLens picks the source files the RCA points at, using the service contract (routes and dependency clients).
2. It reads them from GitHub at the current commit and asks the model for the smallest safe change.
3. It shows you the **exact diff**. Click **Open draft PR**, or turn on **Automatic fix PRs** to have it happen after every RCA.

Guarantees:
- **Draft PRs only.** ServiceLens never merges.
- Fresh branches under `servicelens/` only; nothing else in your repo is touched.
- Refused if the files changed since the fix was generated. Regenerate instead.
- At most **one PR per repository per hour**, and one per incident.
- If the fault isn't fixable in code (capacity, a dependency down, missing secrets), the model says so instead of inventing a change.

Requirements:
- The **ServiceLens GitHub App installed on the repo**. The Services tab has a **GitHub** card showing which repos are covered, with a button that installs the App and brings you back.
- The service **analyzed**.
- A capable `OPENROUTER_MODEL`. Free models often fail at returning whole files.

The PR's state (open/merged/closed) shows on the incident. You and the on-call engineer get a notification when it opens.

---

## 8. Logs (makes RCA much better)

Service page → **Logs ingestion** → copy the service's ingest token, then ship logs:
```bash
curl -X POST "$SERVICELENS_URL/api/services/<serviceId>/logs" \
  -H "Authorization: Bearer <ingest token>" -H "Content-Type: application/json" \
  -d '{"entries":[{"level":"error","message":"payment timeout","fields":{"orderId":"o-1"},"traceId":"abc","at":"2026-09-12T10:00:00Z"}]}'
```
Also accepted: a JSON array, a single object, or NDJSON (`Content-Type: application/x-ndjson`). Levels are `debug`, `info`, `warn` and `error`. Search and live-tail logs from the **Logs** tab. Warn/error lines around an incident are captured into its timeline and fed to the RCA.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing is ever health-checked on Vercel | A cron must call `/api/cron/tick`. Set `CRON_SECRET` and follow [`secrets.md` §4](./secrets.md#4-monitoring-needs-a-cron-on-vercel) |
| "Deployed URL rejected: private address" | Use the public URL, or heartbeats. Self-hosters can set `ALLOW_PRIVATE_PROBES=1` |
| Analysis error: rate limit / not found | Install the GitHub App on the repo (private repos) or set `GITHUB_TOKEN`; check the branch name |
| Dependency edge missing | The caller must read the callee's URL from an env var named after it (`PAYMENTS_SERVICE_URL` → `payments`). Keep service names consistent |
| On-call people get no email | Verify your domain in Resend; check `RESEND_FROM`; check the sheet's `oncall_email` |
| "GitHub App isn't installed on …" | Use the install link on the incident page and add that repo |
| "No safe code change" | The model judged it a non-code issue. Read the RCA's next steps |
| Fix generation 503 | OpenRouter unavailable or rate-limited. Add keys to `OPENROUTER_API_KEYS` or retry |
| Members get 404 | They aren't a member of that architecture; invite them |
