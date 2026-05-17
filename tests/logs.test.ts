import { describe, expect, it } from 'vitest';
import { generateEntries } from '../lib/log-generator';
import { generateIngestToken } from '../lib/logs';

describe('log-generator', () => {
  it('produces the requested count of entries within the time window', () => {
    const entries = generateEntries('TestService', 'healthy', 600, 50);
    expect(entries).toHaveLength(50);
    const now = Date.now();
    for (const e of entries) {
      const t = (e.at instanceof Date ? e.at : new Date(e.at!)).getTime();
      expect(t).toBeLessThanOrEqual(now + 1000);
      expect(t).toBeGreaterThanOrEqual(now - 601 * 1000);
    }
  });

  it('biases toward error level when status is down', () => {
    const down = generateEntries('Svc', 'down', 600, 200);
    const healthy = generateEntries('Svc', 'healthy', 600, 200);
    const downErrors = down.filter((e) => e.level === 'error').length;
    const healthyErrors = healthy.filter((e) => e.level === 'error').length;
    expect(downErrors).toBeGreaterThan(healthyErrors * 3);
  });

  it('attaches traceId/spanId per entry', () => {
    const entries = generateEntries('Svc', 'degraded', 600, 10);
    for (const e of entries) {
      expect(e.traceId).toMatch(/^t_/);
      expect(e.spanId).toMatch(/^s_/);
    }
  });

  it('is deterministic for the same service name + offset', () => {
    const a = generateEntries('Svc', 'healthy', 600, 5, 1);
    const b = generateEntries('Svc', 'healthy', 600, 5, 1);
    expect(a.map((e) => e.message)).toEqual(b.map((e) => e.message));
  });
});

describe('logs/generateIngestToken', () => {
  it('starts with sl_ and is URL-safe', () => {
    const t = generateIngestToken();
    expect(t.startsWith('sl_')).toBe(true);
    expect(t).toMatch(/^sl_[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThan(20);
  });

  it('produces distinct tokens on each call', () => {
    const a = generateIngestToken();
    const b = generateIngestToken();
    expect(a).not.toBe(b);
  });
});
