import { describe, it, expect, beforeEach } from 'vitest';
import { _resetRateLimits, clientIp, rateLimit } from '@/lib/rate-limit';
import { overRateLimit } from '@/lib/api-keys';

describe('rate limiter', () => {
  beforeEach(() => _resetRateLimits());

  it('allows up to the limit per window, then reports when to retry', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000, t).ok).toBe(true);
    const blocked = rateLimit('k', 3, 60_000, t + 15_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(45);
    expect(rateLimit('k', 3, 60_000, t + 60_000).ok).toBe(true); // new window
  });

  it('keeps separate buckets per key', () => {
    expect(rateLimit('a', 1, 60_000, 0).ok).toBe(true);
    expect(rateLimit('a', 1, 60_000, 1).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000, 1).ok).toBe(true);
  });

  it('backs the v1 per-key limit', () => {
    for (let i = 0; i < 120; i++) expect(overRateLimit('key1', 5)).toBe(false);
    expect(overRateLimit('key1', 5)).toBe(true);
  });

  it('reads the client IP from proxy headers', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }))).toBe('203.0.113.9');
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '198.51.100.2' } }))).toBe('198.51.100.2');
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});
