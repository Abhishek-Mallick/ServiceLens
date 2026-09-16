// Rotating Cloudflare Workers AI credential pool with exponential-backoff cooldown.
//
// Workers AI free tier rate-limits per account. With a pool of accountId::token
// pairs we round-robin, cool failed credentials down with exponential backoff,
// and only fall back to the heuristic path once every credential is exhausted.
//
// Env: WORKERS_AI_CREDENTIALS="accountId::token,accountId::token"
//      Legacy WORKERS_AI_CREDENTIAL="accountId::token" still accepted (1-entry pool).

export const RATE_LIMIT_COOLDOWN_MS = 60_000;   // 60s base cooldown for the first 429
export const MAX_BACKOFF_MS = 300_000;          // ceiling — 5 minutes

export interface WorkersAiCredential {
  accountId: string;
  token: string;
}

interface Failure { attempts: number; timestamp: number; cooldownMs: number }

interface PoolGlobal {
  __servicelens_wai_pool?: {
    credentials: WorkersAiCredential[];
    cursor: number;
    failed: Map<string, Failure>;
    pinned?: boolean;
  };
}

export function credentialKey(c: WorkersAiCredential): string {
  return `${c.accountId}::${c.token}`;
}

// Both variables count, and a blank one is ignored: hosts like Vercel often
// define WORKERS_AI_CREDENTIALS="" next to a real WORKERS_AI_CREDENTIAL, and `??`
// would have treated that empty string as "no credentials at all".
export function parseCredentials(env: Record<string, string | undefined>): WorkersAiCredential[] {
  const all = [env.WORKERS_AI_CREDENTIALS, env.WORKERS_AI_CREDENTIAL]
    .filter((v): v is string => !!v)
    .flatMap((v) => v.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const result: WorkersAiCredential[] = [];
  for (const entry of all) {
    const idx = entry.indexOf('::');
    if (idx <= 0) continue;
    const accountId = entry.slice(0, idx).trim();
    const token = entry.slice(idx + 2).trim();
    if (!accountId || !token) continue;
    const key = `${accountId}::${token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ accountId, token });
  }
  return result;
}

function pool() {
  const g = globalThis as unknown as PoolGlobal;
  if (!g.__servicelens_wai_pool) {
    g.__servicelens_wai_pool = { credentials: parseCredentials(process.env), cursor: 0, failed: new Map() };
  } else if (!g.__servicelens_wai_pool.pinned) {
    const fresh = parseCredentials(process.env);
    const freshKeys = fresh.map(credentialKey).join('\0');
    const currentKeys = g.__servicelens_wai_pool.credentials.map(credentialKey).join('\0');
    if (freshKeys !== currentKeys) {
      g.__servicelens_wai_pool.credentials = fresh;
      g.__servicelens_wai_pool.cursor = 0;
      g.__servicelens_wai_pool.failed.clear();
    }
  }
  return g.__servicelens_wai_pool!;
}

export function hasWorkersAiCredentials(): boolean {
  return pool().credentials.length > 0;
}

export function credentialCount(): number {
  return pool().credentials.length;
}

function pruneExpiredFailures() {
  const p = pool();
  const now = Date.now();
  for (const [key, data] of p.failed.entries()) {
    if (now - data.timestamp > data.cooldownMs) p.failed.delete(key);
  }
}

// Returns the next available credential, or null if every entry in the pool is
// cooling down. Callers fall back to the heuristic path when null is returned.
export function pickCredential(): WorkersAiCredential | null {
  const p = pool();
  if (p.credentials.length === 0) return null;
  pruneExpiredFailures();
  for (let i = 0; i < p.credentials.length; i++) {
    const cred = p.credentials[p.cursor]!;
    p.cursor = (p.cursor + 1) % p.credentials.length;
    if (!p.failed.has(credentialKey(cred))) return cred;
  }
  return null;
}

export function markFailed(cred: WorkersAiCredential, cooldownMs = RATE_LIMIT_COOLDOWN_MS): void {
  const p = pool();
  const key = credentialKey(cred);
  const entry = p.failed.get(key) ?? { attempts: 0, timestamp: Date.now(), cooldownMs };
  const attempts = entry.attempts + 1;
  p.failed.set(key, {
    attempts,
    timestamp: Date.now(),
    cooldownMs: Math.min(MAX_BACKOFF_MS, Math.max(cooldownMs, RATE_LIMIT_COOLDOWN_MS * attempts)),
  });
}

export function parseRetryAfterMs(headers: Headers): number | null {
  const raw = headers.get('retry-after')?.trim();
  if (!raw) return null;
  const sec = Number(raw);
  if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000, MAX_BACKOFF_MS);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), MAX_BACKOFF_MS);
  return null;
}

export type WorkersAiRetry =
  | { action: 'retry'; rotateCredential: boolean; waitMs: number; markCredentialFailed: boolean }
  | { action: 'fail'; message: string };

export function classifyWorkersAiResponse(status: number, body: string, retryAfterMs: number | null): WorkersAiRetry {
  const waitMs = retryAfterMs ?? (status === 429 ? 2_000 : 3_000);
  if (isRateLimited(status, body)) {
    return { action: 'retry', rotateCredential: true, waitMs, markCredentialFailed: true };
  }
  if (status >= 500 && status < 600) {
    return { action: 'retry', rotateCredential: false, waitMs, markCredentialFailed: false };
  }
  return { action: 'fail', message: `Workers AI error ${status}: ${body.slice(0, 500)}` };
}

export function isRateLimited(status: number, body: string): boolean {
  if (status === 429) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('quota exceeded') ||
    lower.includes('resource exhausted') ||
    lower.includes('too many requests')
  );
}

// Test hook — wipes pool state. Used only in unit tests.
export function __resetPool(entries: WorkersAiCredential[]): void {
  const g = globalThis as unknown as PoolGlobal;
  g.__servicelens_wai_pool = { credentials: entries.slice(), cursor: 0, failed: new Map(), pinned: true };
}
