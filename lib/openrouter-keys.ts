// Rotating OpenRouter API-key pool with exponential-backoff cooldown.
//
// Why: OpenRouter's free tier rate-limits aggressively. With a single key
// you blow the budget mid-demo. With a pool we round-robin, cool failed
// keys down with exponential backoff, and only fall back to the heuristic
// path once every key in the pool is exhausted.
//
// Env: OPENROUTER_API_KEYS="sk-or-1,sk-or-2,sk-or-3"
//      Legacy OPENROUTER_API_KEY="sk-or-1" still accepted (treated as a 1-key pool).

export const RATE_LIMIT_COOLDOWN_MS = 60_000;   // 60s base cooldown for the first 429
export const MAX_BACKOFF_MS = 300_000;          // ceiling — 5 minutes

interface Failure { attempts: number; timestamp: number; cooldownMs: number }

// Cached on globalThis so HMR doesn't reset the cooldown state in dev.
interface PoolGlobal {
  __servicelens_or_pool?: {
    keys: string[];
    cursor: number;
    failed: Map<string, Failure>;
    pinned?: boolean;
  };
}

// Both variables count, and a blank one is ignored: hosts like Vercel often
// define OPENROUTER_API_KEYS="" next to a real OPENROUTER_API_KEY, and `??`
// would have treated that empty string as "no keys at all".
export function parseKeys(env: Record<string, string | undefined>): string[] {
  const all = [env.OPENROUTER_API_KEYS, env.OPENROUTER_API_KEY]
    .filter((v): v is string => !!v)
    .flatMap((v) => v.split(','))
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(all)];
}

function pool() {
  const g = globalThis as unknown as PoolGlobal;
  if (!g.__servicelens_or_pool) {
    g.__servicelens_or_pool = { keys: parseKeys(process.env), cursor: 0, failed: new Map() };
  } else if (!g.__servicelens_or_pool.pinned) {
    const fresh = parseKeys(process.env);
    if (fresh.join('\0') !== g.__servicelens_or_pool.keys.join('\0')) {
      g.__servicelens_or_pool.keys = fresh;
      g.__servicelens_or_pool.cursor = 0;
      g.__servicelens_or_pool.failed.clear();
    }
  }
  return g.__servicelens_or_pool!;
}

export function hasOpenRouterKeys(): boolean {
  return pool().keys.length > 0;
}

export function keyCount(): number {
  return pool().keys.length;
}

function pruneExpiredFailures() {
  const p = pool();
  const now = Date.now();
  for (const [key, data] of p.failed.entries()) {
    if (now - data.timestamp > data.cooldownMs) p.failed.delete(key);
  }
}

// Returns the next available key, or null if every key in the pool is currently
// cooling down. Callers fall back to the heuristic path when null is returned.
export function pickKey(): string | null {
  const p = pool();
  if (p.keys.length === 0) return null;
  pruneExpiredFailures();
  for (let i = 0; i < p.keys.length; i++) {
    const k = p.keys[p.cursor]!;
    p.cursor = (p.cursor + 1) % p.keys.length;
    if (!p.failed.has(k)) return k;
  }
  return null;
}

export function markFailed(key: string, cooldownMs = RATE_LIMIT_COOLDOWN_MS): void {
  const p = pool();
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

export type OpenRouterRetry =
  | { action: 'retry'; rotateKey: boolean; waitMs: number; markKeyFailed: boolean }
  | { action: 'fail'; message: string };

export function classifyOpenRouterResponse(status: number, body: string, retryAfterMs: number | null): OpenRouterRetry {
  const waitMs = retryAfterMs ?? (status === 429 ? 2_000 : 3_000);
  if (isRateLimited(status, body)) {
    return { action: 'retry', rotateKey: true, waitMs, markKeyFailed: true };
  }
  if (status >= 500 && status < 600) {
    return { action: 'retry', rotateKey: false, waitMs, markKeyFailed: false };
  }
  return { action: 'fail', message: `OpenRouter error ${status}: ${body.slice(0, 500)}` };
}

// Heuristic for "this looks rate-limited / quota-exhausted" — covers OpenRouter's
// 429, upstream provider 429 (Google/Anthropic surface differently), and the
// free-tier "resource exhausted" / "quota exceeded" prose.
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
export function __resetPool(keys: string[]): void {
  const g = globalThis as unknown as PoolGlobal;
  g.__servicelens_or_pool = { keys: keys.slice(), cursor: 0, failed: new Map(), pinned: true };
}
