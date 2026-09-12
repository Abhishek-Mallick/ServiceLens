import { describe, it, expect } from 'vitest';
import { judgeStatus, planContractChecks } from '@/lib/contract-tests';

const ep = (method: string, path: string, line = 1) => ({ method, path, file: 'src/app.js', line });

describe('planContractChecks', () => {
  it('calls only safe routes without parameters, deduped, on the deployed URL', () => {
    const { checks, skipped } = planContractChecks([
      {
        id: 'o', name: 'orders', deployedUrl: 'https://orders.example.com/',
        endpoints: [ep('GET', '/health'), ep('GET', '/api/orders'), ep('GET', '/api/orders'), ep('POST', '/api/orders'), ep('GET', '/api/orders/:id'), ep('GET', '/api/[slug]/items')],
      },
    ]);
    expect(checks.map((c) => c.url)).toEqual(['https://orders.example.com/health', 'https://orders.example.com/api/orders']);
    expect(skipped.map((s) => s.reason)).toEqual([
      'not a safe method (only GET routes are called)',
      'has path parameters',
      'has path parameters',
    ]);
  });

  it('skips services without a deployed URL', () => {
    const { checks, skipped } = planContractChecks([{ id: 'l', name: 'ledger', deployedUrl: null, endpoints: [ep('GET', '/health')] }]);
    expect(checks).toHaveLength(0);
    expect(skipped[0].reason).toBe('no deployed URL');
  });

  it('caps routes per service', () => {
    const endpoints = Array.from({ length: 30 }, (_, i) => ep('GET', `/r${i}`));
    const { checks, skipped } = planContractChecks([{ id: 'x', name: 'x', deployedUrl: 'https://x.io', endpoints }]);
    expect(checks).toHaveLength(25);
    expect(skipped).toHaveLength(5);
  });
});

describe('judgeStatus', () => {
  it.each([200, 204, 301, 302, 401, 403, 429])('%i passes', (s) => expect(judgeStatus(s).pass).toBe(true));
  it.each([404, 405, 500, 502, 503, 418])('%i fails', (s) => expect(judgeStatus(s).pass).toBe(false));
  it('explains 404 as deploy drift', () => expect(judgeStatus(404).note).toMatch(/deploy drift/));
});
