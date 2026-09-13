import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, extractBearer, overRateLimit } from '@/lib/api-keys';
import { evaluateHeartbeat } from '@/lib/probes';

describe('api keys', () => {
  it('generates slk_ keys that round-trip through the bearer parser', () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^slk_[A-Za-z0-9_-]{32}$/);
    expect(prefix).toBe(key.slice(0, 10));
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key);
    expect(extractBearer(`Bearer ${key}`)).toBe(key);
  });

  it('rejects malformed authorization headers', () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer('Bearer abc')).toBeNull();
    expect(extractBearer('Basic slk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull();
    expect(extractBearer('Bearer slk_short')).toBeNull();
  });

  it('rate-limits per key per minute', () => {
    const now = 1_000_000;
    for (let i = 0; i < 120; i++) expect(overRateLimit('k1', now)).toBe(false);
    expect(overRateLimit('k1', now)).toBe(true);
    expect(overRateLimit('k2', now)).toBe(false); // independent keys
    expect(overRateLimit('k1', now + 60_001)).toBe(false); // new window
  });
});

describe('heartbeat evaluation', () => {
  const probe = { id: 'p', intervalSec: 60 };
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it('is down before the first beat', () => {
    expect(evaluateHeartbeat(probe, { at: null, status: null, message: null }, now).status).toBe('down');
  });

  it('reflects the reported status while beats are fresh', () => {
    const at = new Date(now - 30_000);
    expect(evaluateHeartbeat(probe, { at, status: 'healthy', message: null }, now).status).toBe('healthy');
    expect(evaluateHeartbeat(probe, { at, status: 'degraded', message: 'queue backlog' }, now).status).toBe('degraded');
  });

  it('goes down after missing two intervals', () => {
    const r = evaluateHeartbeat(probe, { at: new Date(now - 121_000), status: 'healthy', message: null }, now);
    expect(r.status).toBe('down');
    expect(String(r.details.error)).toMatch(/no heartbeat for 121s/);
    expect(evaluateHeartbeat(probe, { at: new Date(now - 119_000), status: 'healthy', message: null }, now).status).toBe('healthy');
  });
});
