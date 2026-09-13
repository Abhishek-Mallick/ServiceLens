# Secrets & environment variables

Every variable ServiceLens reads, where to get it, and how to set it on **Vercel (production)**. Local dev uses the same names in `.env` (copy `.env.example`).

## 1. Checklist

| Variable | Needed for | Required in prod? | Where it comes from |
|---|---|---|---|
| `DATABASE_URL` | App runtime DB (pooled) | **Yes** | Neon → Connection string, *Pooled* |
| `DIRECT_URL` | `prisma db push` / seed (unpooled) | **Yes** | Neon → Connection string, *Direct* |
| `NEXTAUTH_SECRET` | Sessions + email ack-link signing | **Yes** | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Auth callbacks | **Yes** (Production scope) | Your prod URL, e.g. `https://servicelens.example.com` |
| `NEXT_PUBLIC_APP_URL` | Links in emails / Slack | **Yes** | Same prod URL |
| `CRON_SECRET` | Guards `/api/cron/tick` (monitoring) | **Yes** | `openssl rand -hex 32` |
| `RESEND_API_KEY` | Incident / on-call emails | Yes, if you want email paging | resend.com → API Keys |
| `RESEND_FROM` | Email sender | With Resend | An address on your Resend-verified domain |
| `OPENROUTER_API_KEY` and/or `OPENROUTER_API_KEYS` | AI RCA + fix-PR | Recommended | openrouter.ai/keys. One key in `_KEY`, or several comma-separated in `_KEYS` to rotate. Both are read and blanks are ignored |
| `OPENROUTER_MODEL` | Model choice | No | Default `meta-llama/llama-3.3-70b-instruct:free` |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` | **Opening fix PRs**; reading private repos the App is installed on | Recommended | Your GitHub App (§2) |
| `GITHUB_TOKEN` | Repo analysis for repos the App isn't installed on (5,000 req/h) | Optional | GitHub fine-grained token, *Contents: read-only* |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | "Sign in with GitHub" | No | GitHub OAuth App |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | "Sign in with Google" | No | Google Cloud OAuth client |
| `SECRETS_ENCRYPTION_KEY` | Encrypting stored credentials (DB/Redis probe strings, probe headers, Slack webhooks) | **Yes** (recommended) | `openssl rand -hex 32` |
| `ALLOW_PRIVATE_PROBES` | Probing private/internal IPs | **Never on Vercel** | Self-hosting only: `1` |
| `SCHEDULER`, `SCHEDULER_INTERVAL` | In-process monitoring loop | No (ignored on Vercel) | Self-hosting only |
| `GITHUB_API_URL` | GitHub Enterprise Server | No | e.g. `https://github.example.com/api/v3` |
| `OPENROUTER_BASE_URL` | An OpenAI-compatible proxy or gateway instead of OpenRouter | No | Default `https://openrouter.ai/api/v1` |

**Not read by the code, so leave them empty:** `SLACK_WEBHOOK_URL` (Slack is configured per architecture in the UI), `GITHUB_APP_INSTALLATION_ID` (the installation is looked up per repository), `REDIS_URL`.

Without the optional ones the app still runs:
- no email means in-app alerts only
- no OpenRouter means a heuristic RCA and **no fix PRs** (fixes are never faked)
- no GitHub App means you can't open PRs, but you can still copy the patch
- no App and no token means public repos only, at 60 GitHub API requests per hour

---

## 2. Getting each value

### Database (Neon)
1. <https://console.neon.tech> → create a project → **Connection Details**.
2. **Pooled** string → `DATABASE_URL`. Append `&pgbouncer=true&connection_limit=1`.
3. **Direct** (unpooled) string → `DIRECT_URL`.
4. If you use the **Neon ↔ Vercel integration**, it sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`. You still need to add `DIRECT_URL` yourself, set to the unpooled value, because Prisma reads that name.

### `NEXTAUTH_SECRET`
```bash
openssl rand -base64 32
```
Changing it logs everyone out and invalidates every emailed acknowledge link, so keep it stable.

### `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL`
Both are your public URL, with no trailing slash. `NEXT_PUBLIC_*` values are baked in at **build time**, so redeploy after changing it.

### `SECRETS_ENCRYPTION_KEY`
```bash
openssl rand -hex 32
```
AES-256-GCM key for credentials ServiceLens stores. If it's unset, a key is derived from `NEXTAUTH_SECRET`, which means rotating `NEXTAUTH_SECRET` would make stored database passwords and webhooks unreadable, so set a dedicated key. **Never change it** once credentials are stored (they'd have to be re-entered). Values saved before encryption existed keep working and get encrypted on their next save.

### `CRON_SECRET`
```bash
openssl rand -hex 32
```
Vercel Cron sends it automatically as `Authorization: Bearer …`. Any other pinger must send that header too (see §4).

### Resend (email)
1. <https://resend.com> → **API Keys** → create a key with *Sending access* → `RESEND_API_KEY`.
2. **Domains** → add your domain → add the DNS records it shows (SPF/DKIM) → wait for *Verified*.
3. `RESEND_FROM="ServiceLens <alerts@yourdomain.com>"`.

Until the domain is verified, Resend only delivers to your own account address. On-call engineers and teammates won't get anything.

### OpenRouter (AI)
<https://openrouter.ai/keys> → create a key → `OPENROUTER_API_KEY="sk-or-…"`, or a pool: `OPENROUTER_API_KEYS="sk-or-…,sk-or-…"`. Several keys get rotated when one is rate-limited, which helps a lot on `:free` models. Both variables are merged and a blank one is ignored. Before 2026-09-13, a blank `OPENROUTER_API_KEYS` silently disabled AI, so redeploy if RCAs were coming back as the heuristic report.

### `GITHUB_TOKEN` (repo analysis)
<https://github.com/settings/personal-access-tokens> → **Fine-grained token**:
- Resource owner: the org or user that owns the repos. Org owners may need to approve fine-grained tokens under Org → Settings → Personal access tokens.
- Repository access: *Only select repositories* (or all).
- Permissions: **Contents: Read-only**. Metadata is added automatically. Nothing else.
- Set an expiry and put a rotation reminder in your calendar.

### GitHub App (fix PRs + private repos)
1. <https://github.com/settings/apps/new>, or for an org: Org → Settings → Developer settings → GitHub Apps → New.
2. Name it (e.g. `servicelens-bot`). The homepage URL is your deployment. **Uncheck "Webhook → Active"**, since no webhook is needed.
3. Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**. Metadata: Read-only is added automatically. Nothing else.
4. Create the App. Note its **App ID** → `GITHUB_APP_ID`.
5. **Generate a private key** (downloads a `.pem`) → `GITHUB_APP_PRIVATE_KEY`. Paste the PEM with newlines written as `\n`, or as base64: `base64 -i key.pem | tr -d '\n'`.
6. **Install App** → choose the account/org → *All repositories* or pick the service repos. ServiceLens can only open PRs on repos the App is installed on.
7. Optional but recommended: in the App settings set **Setup URL** to `https://<your-domain>/api/github/setup` and tick **Redirect on update**. Then the "Install" button on the Services → GitHub card brings people straight back to their architecture, with repo coverage refreshed.

The App's token is also used to *read* those repos during analysis, so private repos work without `GITHUB_TOKEN`.

### GitHub sign-in (optional)
<https://github.com/settings/developers> → **OAuth Apps** → New:
- Homepage URL: `https://<your-domain>`
- Callback URL: `https://<your-domain>/api/auth/callback/github`

### Google sign-in (optional)
<https://console.cloud.google.com> → APIs & Services → **OAuth consent screen** (configure it), then **Credentials** → Create OAuth client ID → *Web application*:
- Authorized redirect URI: `https://<your-domain>/api/auth/callback/google`

Each OAuth app is tied to one callback URL. Use a separate OAuth app for local dev (`http://localhost:3000/...`).

---

## 3. Setting them on Vercel

**Dashboard:** Project → **Settings → Environment Variables** → add each one, choose **Production** (and Preview if you use previews), and tick **Sensitive** for secrets.

**CLI:**
```bash
vercel link
vercel env add NEXTAUTH_SECRET production     # prompts for the value
vercel env ls
vercel env pull .env.local                    # copy non-sensitive values locally
```

Rules that matter:
- **Redeploy after any change.** Env vars only apply to new deployments.
- Set `NEXTAUTH_URL` for **Production only**. On Preview deployments NextAuth falls back to Vercel's per-deployment URL, and OAuth sign-in won't work there unless you add those callback URLs.
- Don't set `ALLOW_PRIVATE_PROBES`, `SCHEDULER` or `SCHEDULER_INTERVAL` on Vercel.

### Database schema (not run by the build)
The build only runs `prisma generate`. Apply the schema to the prod DB from your machine, using the prod connection strings, once per schema change:
```bash
DATABASE_URL="<prod pooled>" DIRECT_URL="<prod direct>" npm run prisma:push
DATABASE_URL="<prod pooled>" DIRECT_URL="<prod direct>" npm run db:migrate-demo   # safe to re-run
# first deploy only, if you want the demo mesh:
DATABASE_URL="<prod pooled>" DIRECT_URL="<prod direct>" npm run prisma:seed
```

---

## 4. Monitoring needs a cron on Vercel

Vercel can't keep the monitoring loop running, so **nothing gets health-checked unless `/api/cron/tick` is called**. Pick one:

| Option | Cadence | Setup |
|---|---|---|
| **GitHub Actions** (bundled, `.github/workflows/scheduler-tick.yml`) | every 5 min | Repo → Settings → Secrets and variables → **Actions** → add `SERVICELENS_URL` (`https://<your-domain>`) and `CRON_SECRET` (same value as on Vercel) |
| cron-job.org | every 1 min | URL `https://<your-domain>/api/cron/tick`, header `Authorization: Bearer <CRON_SECRET>` |
| Vercel Cron (`vercel.json`) | daily on Hobby; any cadence on Pro | Nothing extra: Vercel adds the header from `CRON_SECRET` |

Verify:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/tick
# → {"probed":…,"simulated":…,"chaos":…,"jobs":…,"ms":…}
```

---

## 5. Hygiene

- `.env` / `.env.local` are git-ignored. Never commit real values; `.env.example` holds placeholders only.
- Rotate `CRON_SECRET`, `GITHUB_TOKEN`, and API keys if they leak. Rotating `NEXTAUTH_SECRET` signs everyone out.
- The seeded demo login (`demo@servicelens.com` / `demo123`) is public in the README and **owns** the demo architecture. On a public deployment, change its password in the DB or skip `prisma:seed`. Other users get read-only access to the demo automatically.
