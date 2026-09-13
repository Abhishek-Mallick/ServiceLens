import { describe, it, expect } from 'vitest';
import { decide, type AlertContext } from '@/lib/alert-rules';
import { DEFAULT_RULES, DEFAULT_PROBE_INTERVAL_SEC, joinHealthUrl } from '@/lib/monitoring/defaults';

type Status = 'healthy' | 'degraded' | 'down';
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

// Build a history sampled at the default probe cadence, newest sample at NOW.
function history(samples: Array<[Status, number | null]>): AlertContext {
  const n = samples.length;
  return {
    serviceId: 's',
    history: samples.map(([status, responseTime], i) => ({
      status,
      responseTime,
      checkedAt: new Date(NOW - (n - 1 - i) * DEFAULT_PROBE_INTERVAL_SEC * 1000),
    })),
  };
}

const rule = (key: string) => DEFAULT_RULES.find((r) => r.key === key)!;

describe('default alert rules at the default probe cadence', () => {
  it('service down fires after 3 consecutive failures, not after 2', () => {
    const r = rule('default:down');
    const two = history([['healthy', 80], ['healthy', 90], ['down', null], ['down', null]]);
    const three = history([['healthy', 80], ['down', null], ['down', null], ['down', null]]);
    expect(decide(r.condition, r, two, NOW)).not.toBe('fire');
    expect(decide(r.condition, r, three, NOW)).toBe('fire');
  });

  it('service down clears once the service recovers', () => {
    const r = rule('default:down');
    const recovered = history([['down', null], ['down', null], ['down', null], ['healthy', 70]]);
    expect(decide(r.condition, r, recovered, NOW)).toBe('clear');
  });

  it('high latency fires on sustained slow checks and ignores a single spike', () => {
    const r = rule('default:latency');
    const spike = history([['healthy', 100], ['healthy', 110], ['healthy', 120], ['healthy', 3000], ['healthy', 100]]);
    const slow = history([['healthy', 2500], ['healthy', 2600], ['healthy', 2400], ['healthy', 2700], ['healthy', 2800]]);
    expect(decide(r.condition, r, slow, NOW)).toBe('fire');
    expect(decide(r.condition, r, spike, NOW)).not.toBe('fire');
  });

  it('high latency does not fire until slowness has lasted forDuration', () => {
    const r = rule('default:latency');
    const justStarted = history([['healthy', 100], ['healthy', 100], ['healthy', 100], ['healthy', 2500], ['healthy', 2600]]);
    expect(decide(r.condition, r, justStarted, NOW)).toBe('hold');
  });

  it('error rate fires when >20% of recent checks fail', () => {
    const r = rule('default:error-rate');
    const flaky = history([['healthy', 90], ['healthy', 90], ['down', null], ['degraded', 900], ['down', null]]);
    const fine = history([['healthy', 90], ['healthy', 90], ['healthy', 90], ['healthy', 90], ['healthy', 90]]);
    expect(decide(r.condition, r, flaky, NOW)).toBe('fire');
    expect(decide(r.condition, r, fine, NOW)).toBe('clear');
  });
});

describe('joinHealthUrl', () => {
  it('normalises slashes', () => {
    expect(joinHealthUrl('https://a.com/', '/health')).toBe('https://a.com/health');
    expect(joinHealthUrl('https://a.com', 'healthz')).toBe('https://a.com/healthz');
    expect(joinHealthUrl('https://a.com/api/', '/v1/health')).toBe('https://a.com/api/v1/health');
  });
});
