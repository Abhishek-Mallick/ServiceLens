// Rotating OpenRouter API-key pool with exponential-backoff cooldown.
//
// Why: OpenRouter's free tier rate-limits aggressively. With a single key
// you blow the budget mid-demo. With a pool we round-robin, cool failed
// keys down with exponential backoff, and only fall back to the heuristic
// path once every key in the pool is exhausted.
//
// Env: OPENROUTER_API_KEYS="sk-or-1,sk-or-2,sk-or-3"
//      Legacy OPENROUTER_API_KEY="sk-or-1" still accepted (treated as a 1-key pool).

const RATE_LIMIT_COOLDOWN_MS = 60_000;   // 60s base cooldown for the first 429
const MAX_BACKOFF_MS = 300_000;          // ceiling — 5 minutes

interface Failure { attempts: number; timestamp: number }

// Cached on globalThis so HMR doesn't reset the cooldown state in dev.
interface PoolGlobal {
  __servicelens_or_pool?: {
    keys: string[];
    cursor: number;
    failed: Map<string, Failure>;
  };
}

function pool() {
  const g = globalThis as unknown as PoolGlobal;
  if (!g.__servicelens_or_pool) {
    const raw = process.env.OPENROUTER_API_KEYS ?? process.env.OPENROUTER_API_KEY ?? '';
    const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
    g.__servicelens_or_pool = { keys, cursor: 0, failed: new Map() };
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
    const backoff = Math.min(MAX_BACKOFF_MS, RATE_LIMIT_COOLDOWN_MS * (data.attempts + 1));
    if (now - data.timestamp > backoff) p.failed.delete(key);
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

export function markFailed(key: string): void {
  const p = pool();
  const entry = p.failed.get(key) ?? { attempts: 0, timestamp: Date.now() };
  p.failed.set(key, { attempts: entry.attempts + 1, timestamp: Date.now() });
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
  g.__servicelens_or_pool = { keys: keys.slice(), cursor: 0, failed: new Map() };
}
