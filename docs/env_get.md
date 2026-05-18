# Where every env value comes from

A step-by-step for every variable in `.env.example`. Required keys are flagged ⚠. Everything else is optional — the app degrades to console / heuristic / simulator when a key is missing.

> Tip: `cp .env.example .env` first, then fill in the lines as you walk through this doc.

---

## ⚠ Database — `DATABASE_URL` + `DIRECT_URL`

### Option A — Neon (managed, free tier)
1. Sign up at <https://console.neon.tech>. Verify your email.
2. Click **Create Project**. Region close to you. Project name `servicelens`. Postgres 16 default.
3. After creation you land on the project page. Sidebar → **Connection Details**.
4. **DATABASE_URL** — copy the **Pooled connection** string. Append the required Prisma params if missing:
   ```
   ?sslmode=require&pgbouncer=true&connection_limit=1
   ```
   It looks like:
   ```
   postgresql://USER:PASS@ep-xxx-pooler.REGION.aws.neon.tech/servicelens?sslmode=require&pgbouncer=true&connection_limit=1
   ```
5. **DIRECT_URL** — switch the connection-string mode toggle to **Direct connection** and copy that one. Used by `prisma db push` + seed (bypasses PgBouncer).
6. Free tier: 0.5 GB storage, autoscale down to zero compute when idle.

### Option B — Local Postgres via Docker
```bash
docker compose up -d postgres
```
Then paste the lines below into `.env`:
```bash
DATABASE_URL="postgresql://servicelens:servicelens@localhost:5432/servicelens?sslmode=disable"
DIRECT_URL="postgresql://servicelens:servicelens@localhost:5432/servicelens?sslmode=disable"
```
That's it — `docker-compose.yml` ships the credentials.

---

## ⚠ `NEXTAUTH_SECRET`

A random 32+ char string. Don't reuse across environments.
```bash
openssl rand -hex 32
```
Or use any password manager's "generate random". Paste the value verbatim.

## ⚠ `NEXTAUTH_URL` + `NEXT_PUBLIC_APP_URL`

The public base URL the browser hits.
- Local dev: `http://localhost:3000`
- Vercel preview: leave blank (Vercel sets `VERCEL_URL` automatically, NextAuth picks it up)
- Production: `https://your-domain.com`

---

## OpenRouter (AI) — `OPENROUTER_API_KEYS` + `OPENROUTER_MODEL`

ServiceLens uses a **rotating key pool** to dodge free-tier rate limits. Sign up multiple free OpenRouter accounts (different emails) and paste their keys comma-separated.

1. Go to <https://openrouter.ai>. Click **Sign in** (GitHub or Google works).
2. Top-right avatar → **Keys**.
3. **Create Key** → name it `servicelens-1`. Copy the value (starts with `sk-or-`).
4. **Repeat** for additional accounts if you want more headroom. Free tier has per-account daily quotas — multiple keys = multiplied quota.
5. Paste them comma-separated:
   ```bash
   OPENROUTER_API_KEYS="sk-or-aaa...,sk-or-bbb...,sk-or-ccc..."
   ```
6. **OPENROUTER_MODEL** — pick a `:free` model. Defaults to `meta-llama/llama-3.3-70b-instruct:free`. Other good free options:
   - `google/gemini-2.0-flash-exp:free`
   - `qwen/qwen-2.5-72b-instruct:free`
   - `mistralai/mistral-small-3.1-24b-instruct:free`

The legacy singular `OPENROUTER_API_KEY` is still accepted (1-key pool) for backward compatibility.

**Free-tier behavior:** when every key in the pool is cooling down, the platform falls back to the heuristic analyzer — the demo still works, just without streamed AI output.

---

## GitHub OAuth — `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`

For "Continue with GitHub" on `/login`.

1. <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
2. **Application name:** ServiceLens (local) or whatever you like.
3. **Homepage URL:** `http://localhost:3000` (dev) or your prod URL.
4. **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
   - For Vercel: `https://your-app.vercel.app/api/auth/callback/github`
   - You can register multiple OAuth apps (one per env), or add multiple callback URLs to the same app.
5. **Register application**.
6. Copy **Client ID** → `GITHUB_CLIENT_ID`.
7. Click **Generate a new client secret** → copy → `GITHUB_CLIENT_SECRET`.

---

## Google OAuth — `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`

For "Continue with Google" on `/login`.

1. <https://console.cloud.google.com> → create a project named `servicelens`.
2. Sidebar → **APIs & Services** → **OAuth consent screen**.
3. **User type: External**. Fill app name + your email. **Save and continue** through the rest (scopes can stay default — NextAuth requests `openid`/`email`/`profile`).
4. Sidebar → **Credentials** → **+ Create credentials** → **OAuth client ID**.
5. **Application type:** Web application. Name `servicelens`.
6. **Authorized JavaScript origins:** `http://localhost:3000` (dev) + your prod URL.
7. **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google` (and the prod equivalent).
8. **Create**. Copy **Client ID** → `GOOGLE_CLIENT_ID`. **Client secret** → `GOOGLE_CLIENT_SECRET`.

---

## Resend (email) — `RESEND_API_KEY` + `RESEND_FROM`

For real email delivery of incident notifications. Free tier: 3,000 emails / month, 100 / day.

1. <https://resend.com> → sign up.
2. **API Keys** → **Create API Key**. Permission **Sending access**. Name `servicelens-dev`. Copy → `RESEND_API_KEY`.
3. **Domains** → **Add Domain**. Type your domain (or skip and use the shared `onboarding@resend.dev` for testing).
4. Add the DNS records Resend shows. Wait for verification.
5. **RESEND_FROM** — once verified:
   ```
   RESEND_FROM="ServiceLens <alerts@yourdomain.com>"
   ```
   For quick demos with no verified domain:
   ```
   RESEND_FROM="ServiceLens <onboarding@resend.dev>"
   ```
   (Resend's shared sender is rate-limited but lets you smoke-test the wire-up.)

> Local alternative: run `docker compose up -d mailpit`, leave `RESEND_API_KEY` empty. The notification dispatcher logs to console and Mailpit captures any SMTP testing.

---

## Slack — `SLACK_WEBHOOK_URL`

Per-architecture overrides are configured in the UI; this is the optional global fallback.

1. <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name `ServiceLens`. Pick a workspace.
3. Left sidebar → **Incoming Webhooks** → toggle **On**.
4. **Add New Webhook to Workspace** → pick a channel (e.g. `#incidents`). **Allow**.
5. Copy the webhook URL (starts with `https://hooks.slack.com/services/T0…`).
6. Paste into `.env` or — preferred — configure it per-architecture under **Alerts → Notification routing** in the app UI.

---

## CRON — `CRON_SECRET`

Protects `/api/cron/tick` so randos can't trigger your chaos drills.

```bash
openssl rand -hex 32
```
Paste the value. Then when configuring Vercel Cron / cron-job.org, send:
```
Authorization: Bearer <CRON_SECRET>
```

If `CRON_SECRET` is unset, the endpoint is open (fine for `localhost`, **not for production**).

---

## Worker — `WORKER_INTERVAL`

Cadence (seconds) for the standalone `npm run worker` tick. Default 30. Lower = more responsive chaos drills, higher = lighter DB load. Minimum is 5.

```bash
WORKER_INTERVAL="30"
```

Only used by the self-hosted worker process. Vercel deployments use Vercel Cron + `/api/cron/tick` instead.

---

## GitHub App (Phase 4 v2 — fix-PR creation) — `GITHUB_APP_*`

Optional. Without these the AI fix-PR feature still works in v1 mode (renders the diff + Copy/Download). With them, "Generate fix PR" can open a real draft PR on the linked repo.

1. <https://github.com/settings/apps> → **New GitHub App**.
2. Name `servicelens-fix-pr-bot`. Homepage = your app URL. Webhook URL leave blank, deactivate webhook.
3. **Repository permissions:** Contents = Read & Write, Pull requests = Read & Write.
4. **Where can this app be installed:** "Only on this account" (or any).
5. **Create GitHub App**.
6. **Generate a private key** at the bottom → downloads a `.pem` file. Open it, copy the contents (including `-----BEGIN/END...`) → put it on a single line with `\n` escapes for env-var safety, or store it as a multi-line secret in your host:
   ```
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
   ```
7. Note the **App ID** at the top → `GITHUB_APP_ID`.
8. **Install App** (sidebar) → install on the repo you want to demo against.
9. Open the installation page URL — the trailing number is `GITHUB_APP_INSTALLATION_ID`.

---

## Redis — `REDIS_URL` (Phase 7 swap-in, optional)

Not used by the current in-process queue. Hook this up if you swap `lib/jobs.ts` for BullMQ. Upstash free tier (`https://upstash.com`) is the easiest path: 10k commands/day, 256 MB.

---

## Putting it together

Minimum to run the app locally with everything stubbed:
- `DATABASE_URL` + `DIRECT_URL`
- `NEXTAUTH_SECRET`

That gets you a fully working demo (notifications log to console, AI uses heuristic, no chaos cron).

Add `OPENROUTER_API_KEYS` for real AI. Add `RESEND_API_KEY` + `SLACK_WEBHOOK_URL` for real notifications. Everything else is gravy.
