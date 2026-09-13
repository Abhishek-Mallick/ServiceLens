// Fixed-window rate limiter for public endpoints (log ingest, magic-link ack,
// signup, the v1 API). In-memory and per instance: it stops runaway clients and
// scripted abuse of a single instance; a shared limit across instances needs
// Redis (tracked with multi-instance realtime in STATUS §3.6).

import { NextResponse } from 'next/server';

interface Bucket { windowStart: number; count: number }
const buckets = new Map<string, Bucket>();
const SWEEP_AT = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()): RateLimitResult {
  if (buckets.size > SWEEP_AT) {
    for (const [k, b] of buckets) if (now - b.windowStart >= windowMs) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    b = { windowStart: now, count: 0 };
    buckets.set(key, b);
  }
  b.count++;
  const ok = b.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - b.count),
    retryAfterSec: ok ? 0 : Math.max(1, Math.ceil((b.windowStart + windowMs - now) / 1000)),
  };
}

// The caller's IP as seen by the platform proxy (Vercel sets x-forwarded-for).
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function tooManyRequests(r: RateLimitResult, message = 'Too many requests. Try again shortly.'): NextResponse {
  return NextResponse.json({ error: message, code: 'rate_limited' }, { status: 429, headers: { 'retry-after': String(r.retryAfterSec) } });
}

// Limits used by the public routes, in one place so they're easy to tune.
export const LIMITS = {
  logIngestPerMin: 600, // per service token (10 req/s; each request may carry a batch)
  ackPerMin: 30, // per IP, magic-link confirm page + POST
  signupPer10Min: 5, // per IP
  v1PerMin: 120, // per API key
} as const;

export function _resetRateLimits(): void {
  buckets.clear();
}
