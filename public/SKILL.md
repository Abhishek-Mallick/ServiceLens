---
name: servicelens
description: Register, update and monitor microservices on ServiceLens (health checks, incidents, on-call paging, AI root-cause analysis and fix PRs) through its HTTP API with curl. Use when asked to onboard a service or a whole repo/topology to ServiceLens, keep ServiceLens in sync on deploy, report a service's health from a private network, or check what is currently broken.
---

# ServiceLens

ServiceLens monitors a team's services. Once a service is registered with its GitHub repo and deployed URL, ServiceLens:
- reads the repo to map endpoints and dependencies
- health-checks the deployed URL every minute
- opens incidents and pages the on-call engineer
- writes a root-cause analysis and can open a draft fix PR

## Setup

You need two values from the user:

| Variable | Where it comes from |
|---|---|
| `SERVICELENS_URL` | The ServiceLens deployment, e.g. `https://servicelens.example.com` |
| `SERVICELENS_API_KEY` | ServiceLens → the architecture → **Services** → **API keys** → Create key (starts with `slk_`) |

A key is scoped to one architecture (one group of services). **Never print, log or commit the key.** Read it from the environment.

Verify it first:

```bash
curl -fsS "$SERVICELENS_URL/api/v1/architecture" -H "Authorization: Bearer $SERVICELENS_API_KEY"
```

This returns the architecture name, its dashboard URL, and every registered service with its health and analysis status.

## Register or update a service (idempotent)

`PUT /api/v1/services/{name}` creates the service if it doesn't exist and updates it if it does, so it's safe to run on every deploy.

```bash
curl -fsS -X PUT "$SERVICELENS_URL/api/v1/services/orders" \
  -H "Authorization: Bearer $SERVICELENS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/acme/orders",
    "branch": "main",
    "deployedUrl": "https://orders.acme.com",
    "healthPath": "/health"
  }'
```

| Field | Required | Notes |
|---|---|---|
| `repoUrl` | yes | GitHub URL, `https://github.com/<owner>/<repo>` |
| `branch` | no | Default `main`. Falls back to the repo's default branch if missing |
| `deployedUrl` | no | Public base URL. Without it the service is mapped but not health-checked (use a heartbeat instead) |
| `healthPath` | no | Default `/health`, appended to `deployedUrl`. Must return 2xx when healthy |
| `analyze` | no | Default `true`: re-read the repo and re-derive dependencies in the background |

The response is `201` when created and `200` when updated, with `{ service, created, analysis }`. Errors look like `{ "error": { "code", "message", "details" } }`. Common ones:
- `400 invalid_input`: not a GitHub URL, a private/unreachable deployed URL, or a bad field
- `401`: missing or revoked key
- `409`: a name conflict
- `429`: more than 120 requests/min per key

## Onboarding a whole topology

When asked to onboard "all our services":
1. Find the services. Typical sources are one repo per service in the org, a monorepo's deploy manifests (`docker-compose.yml`, k8s `Deployment`/`Service`, `vercel.json`, `fly.toml`, Helm values), or a list from the user.
2. For each service, work out `name` (short and stable, e.g. `orders`), `repoUrl` (`git remote get-url origin`, normalised to `https://github.com/owner/repo`), and `deployedUrl` from the deploy config. **If you can't find a deployed URL, ask the user; don't guess.**
3. Call `PUT /api/v1/services/{name}` once per service.
4. Call `GET /api/v1/architecture` and report back: services registered, any `analysis.error`, and the dashboard URL.

Dependencies between services are detected automatically when one service's code reads another's URL from an env var (e.g. `PAYMENTS_SERVICE_URL` → the `payments` service). Consistent service names make this work best.

## Keep it in sync on deploy (CI)

GitHub Actions step, with `SERVICELENS_URL` and `SERVICELENS_API_KEY` stored as repo secrets:

```yaml
- name: Register with ServiceLens
  run: |
    curl -fsS -X PUT "${{ secrets.SERVICELENS_URL }}/api/v1/services/${{ github.event.repository.name }}" \
      -H "Authorization: Bearer ${{ secrets.SERVICELENS_API_KEY }}" \
      -H "Content-Type: application/json" \
      -d "{\"repoUrl\":\"https://github.com/${{ github.repository }}\",\"branch\":\"${{ github.ref_name }}\",\"deployedUrl\":\"https://orders.acme.com\"}"
```

## Gate a deploy on contract tests

After deploying, call every GET route ServiceLens found in the code on the deployed services. Fail the pipeline if any route is missing (404) or erroring (5xx):

```bash
curl -fsS -X POST "$SERVICELENS_URL/api/v1/contract-tests" -H "Authorization: Bearer $SERVICELENS_API_KEY" > result.json
jq '{total, passed, failed, failures, url}' result.json
test "$(jq .failed result.json)" -eq 0
```

Report `failures` (service, path, status, error) and the run `url` to the user.

## Services on a private network: heartbeats

If ServiceLens can't reach the service, the service reports its own health instead. The first heartbeat turns on push monitoring; if heartbeats stop for 2× `intervalSec`, the service is marked **down** and normal alerting and paging apply.

```bash
curl -fsS -X POST "$SERVICELENS_URL/api/v1/services/orders/heartbeat" \
  -H "Authorization: Bearer $SERVICELENS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"healthy","intervalSec":60}'
```

`status` is `healthy`, `degraded` or `down`. `message` is an optional short explanation. Send it from a cron or sidecar every `intervalSec` seconds.

## Check what's broken

```bash
curl -fsS "$SERVICELENS_URL/api/v1/incidents?status=open" -H "Authorization: Bearer $SERVICELENS_API_KEY"
curl -fsS "$SERVICELENS_URL/api/v1/services/orders"       -H "Authorization: Bearer $SERVICELENS_API_KEY"
```

Each incident includes severity, status, service, who was paged (`oncall`), any open fix PR (`fixPr.prUrl`), and a `url` to the incident page. Share that URL rather than trying to fix things through the API; acknowledging and resolving happen in the ServiceLens UI or through the email links.

## Remove a service

```bash
curl -fsS -X DELETE "$SERVICELENS_URL/api/v1/services/orders" -H "Authorization: Bearer $SERVICELENS_API_KEY"
```

Only delete when the user explicitly asks. It removes the service's health history and its incident links.
