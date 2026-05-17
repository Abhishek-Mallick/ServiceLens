import { describe, expect, it } from 'vitest';
import { evaluate, describeCondition, type AlertContext } from '../lib/alert-rules';

function ctx(history: Array<['healthy' | 'degraded' | 'down', number | null]>, latestRun?: { failedSteps: number; totalSteps: number }): AlertContext {
  return {
    serviceId: 's1',
    history: history.map(([status, rt], i) => ({ status, responseTime: rt, checkedAt: new Date(Date.now() - (history.length - i) * 1000) })),
    latestRun,
  };
}

describe('alert-rules evaluator', () => {
  it('status_eq fires only on matching last status', () => {
    expect(evaluate({ kind: 'status_eq', status: 'down' }, ctx([['healthy', 100], ['down', null]]))).toBe(true);
    expect(evaluate({ kind: 'status_eq', status: 'down' }, ctx([['down', null], ['healthy', 100]]))).toBe(false);
  });

  it('status_eq returns false for empty history', () => {
    expect(evaluate({ kind: 'status_eq', status: 'down' }, ctx([]))).toBe(false);
  });

  it('p95_latency_gt fires when 95th percentile exceeds threshold', () => {
    const h: Array<['healthy', number]> = Array.from({ length: 20 }, (_, i) => ['healthy', 100 + i * 50] as ['healthy', number]);
    // 20 samples 100..1050; p95 ≈ 1000
    expect(evaluate({ kind: 'p95_latency_gt', thresholdMs: 800 }, ctx(h))).toBe(true);
    expect(evaluate({ kind: 'p95_latency_gt', thresholdMs: 2000 }, ctx(h))).toBe(false);
  });

  it('error_rate_gt counts non-healthy entries', () => {
    const h: Array<['healthy' | 'down', null | number]> = [
      ['healthy', 100], ['healthy', 100], ['down', null], ['down', null], ['healthy', 100],
    ];
    // 2/5 = 0.4
    expect(evaluate({ kind: 'error_rate_gt', threshold: 0.3 }, ctx(h))).toBe(true);
    expect(evaluate({ kind: 'error_rate_gt', threshold: 0.5 }, ctx(h))).toBe(false);
  });

  it('consecutive_down requires N tail items', () => {
    expect(evaluate({ kind: 'consecutive_down', count: 3 }, ctx([['healthy', 100], ['down', null], ['down', null], ['down', null]]))).toBe(true);
    expect(evaluate({ kind: 'consecutive_down', count: 3 }, ctx([['down', null], ['healthy', 100], ['down', null], ['down', null]]))).toBe(false);
    expect(evaluate({ kind: 'consecutive_down', count: 3 }, ctx([['down', null], ['down', null]]))).toBe(false);
  });

  it('regression_failed uses the latest run', () => {
    expect(evaluate({ kind: 'regression_failed', minFailed: 1 }, ctx([], { failedSteps: 2, totalSteps: 20 }))).toBe(true);
    expect(evaluate({ kind: 'regression_failed', minFailed: 5 }, ctx([], { failedSteps: 2, totalSteps: 20 }))).toBe(false);
    expect(evaluate({ kind: 'regression_failed', minFailed: 1 }, ctx([], null as unknown as undefined))).toBe(false);
  });

  it('describeCondition produces human-readable summaries', () => {
    expect(describeCondition({ kind: 'status_eq', status: 'down' })).toMatch(/down/);
    expect(describeCondition({ kind: 'p95_latency_gt', thresholdMs: 800 })).toMatch(/800/);
    expect(describeCondition({ kind: 'error_rate_gt', threshold: 0.25 })).toMatch(/25/);
    expect(describeCondition({ kind: 'consecutive_down', count: 4 })).toMatch(/4/);
    expect(describeCondition({ kind: 'regression_failed', minFailed: 2 })).toMatch(/2/);
  });
});
