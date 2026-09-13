import { describe, it, expect } from 'vitest';
import { mergeActivity, percentile, uptimeRatio } from '@/lib/workspace';
import { bestMatch, formatUptime, matchesFilter } from '@/lib/workspace-filters';

describe('workspace numbers', () => {
  it('uptime counts every non-down check as up', () => {
    expect(uptimeRatio([{ status: 'healthy', count: 90 }, { status: 'degraded', count: 5 }, { status: 'down', count: 5 }])).toBeCloseTo(0.95);
    expect(uptimeRatio([])).toBeNull();
  });

  it('p95 is nearest-rank', () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95);
    expect(percentile([100, 1, 50], 50)).toBe(50);
  });

  it('formats uptime for humans', () => {
    expect(formatUptime(null)).toBe('—');
    expect(formatUptime(1)).toBe('100%');
    expect(formatUptime(0.99912)).toBe('99.91%');
    expect(formatUptime(0.873)).toBe('87.3%');
  });
});

describe('activity feed', () => {
  it('merges, dedupes, sorts newest first and caps', () => {
    const a = { id: 'x', at: '2026-09-13T10:00:00.000Z', kind: 'incident' as const, title: 'a' };
    const b = { id: 'y', at: '2026-09-13T12:00:00.000Z', kind: 'tests' as const, title: 'b' };
    const c = { id: 'z', at: '2026-09-13T11:00:00.000Z', kind: 'service' as const, title: 'c' };
    const merged = mergeActivity([[a, b], [a, c]], 2);
    expect(merged.map((m) => m.id)).toEqual(['y', 'z']);
  });
});

describe('filters and search', () => {
  const svc = (name: string, healthStatus: string, incident = false) => ({
    name, healthStatus, framework: 'express', openIncident: incident ? { id: 'i', title: 't', severity: 'critical', status: 'open' } : null,
  });

  it('filters by health and incidents, then by query', () => {
    expect(matchesFilter(svc('orders', 'healthy'), 'unhealthy', '')).toBe(false);
    expect(matchesFilter(svc('orders', 'down'), 'unhealthy', '')).toBe(true);
    expect(matchesFilter(svc('orders', 'down'), 'incidents', '')).toBe(false);
    expect(matchesFilter(svc('orders', 'down', true), 'incidents', '')).toBe(true);
    expect(matchesFilter(svc('orders', 'healthy'), 'all', 'ORD')).toBe(true);
    expect(matchesFilter(svc('orders', 'healthy'), 'all', 'express')).toBe(true);
    expect(matchesFilter(svc('orders', 'healthy'), 'all', 'pay')).toBe(false);
  });

  it('search prefers exact, then prefix, then substring', () => {
    const list = [{ name: 'payments-worker' }, { name: 'api-payments' }, { name: 'payments' }];
    expect(bestMatch(list, 'payments')?.name).toBe('payments');
    expect(bestMatch(list, 'pay')?.name).toBe('payments-worker');
    expect(bestMatch(list, 'api')?.name).toBe('api-payments');
    expect(bestMatch(list, '')).toBeNull();
  });
});
