import { describe, expect, it } from 'vitest';
import { buildPrompt, type RcaContext } from '../lib/rca';
import { parseFixPr, renderPatch, type FixPr } from '../lib/fix-pr';

function ctx(overrides: Partial<RcaContext> = {}): RcaContext {
  return {
    incident: {
      id: 'i1', title: 'Payment down 3x consecutive', severity: 'critical',
      summary: '3 consecutive down checks', serviceId: 's1', architectureId: 'a1',
      openedAt: new Date('2026-05-18T12:00:00Z'),
    },
    architectureName: 'E-Commerce',
    serviceName: 'Payment Service',
    serviceSummary: 'Authorizes payments via Stripe.',
    healthWindow: [
      { status: 'down', rt: null, at: '2026-05-18T11:58:00Z' },
      { status: 'down', rt: null, at: '2026-05-18T11:59:00Z' },
    ],
    neighborHealth: [{ name: 'Order Service', status: 'degraded', rt: 1200 }],
    logsSnapshot: [
      { service: 'Payment Service', level: 'error', message: 'upstream returned 503', at: '2026-05-18T11:59:30Z' },
    ],
    failedRegression: [
      { service: 'Payment Service', step: 'POST /api/payments/charge', error: 'timeout' },
    ],
    priorResolved: [
      { title: 'Payment timeouts (Stripe rate limit)', resolution: 'backed off retry policy', ageDays: 3 },
    ],
    ...overrides,
  };
}

describe('rca/buildPrompt', () => {
  it('produces system + user messages with critical sections', () => {
    const msgs = buildPrompt(ctx());
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    const u = msgs[1].content;
    expect(u).toContain('Payment Service');
    expect(u).toContain('Health window');
    expect(u).toContain('1-hop neighbor health');
    expect(u).toContain('Logs at incident open');
    expect(u).toContain('Recent failed regression steps');
    expect(u).toContain('runbook memory');
    expect(u).toContain('Likely root cause');
  });

  it('caps log section size', () => {
    const huge = Array.from({ length: 200 }, (_, i) => ({
      service: 'X', level: 'error', message: 'long message '.repeat(20), at: `2026-05-18T${String(i % 60).padStart(2, '0')}:00:00Z`,
    }));
    const msgs = buildPrompt(ctx({ logsSnapshot: huge }));
    // The log section should be capped (< 6k chars to be safe)
    expect(msgs[1].content.length).toBeLessThan(20_000);
  });

  it('omits empty sections cleanly', () => {
    const msgs = buildPrompt(ctx({ neighborHealth: [], logsSnapshot: [], failedRegression: [], priorResolved: [] }));
    expect(msgs[1].content).not.toContain('1-hop neighbor');
    expect(msgs[1].content).not.toContain('Logs at incident open');
    expect(msgs[1].content).not.toContain('runbook memory');
  });
});

const VALID: FixPr = {
  summary: 'Lower retry count on Stripe client',
  branchName: 'fix/stripe-retry-backoff',
  files: [
    {
      path: 'src/payments/client.ts',
      patch: '--- a/src/payments/client.ts\n+++ b/src/payments/client.ts\n@@ -1,3 +1,3 @@\n-const RETRIES = 5;\n+const RETRIES = 2;\n const TIMEOUT = 5000;\n',
    },
  ],
  prTitle: 'fix(payments): reduce Stripe retry count from 5 to 2',
  prBody: '## Why\nObserved repeated 503s under load.\n## What changed\n- RETRIES 5 → 2\n## How to test\n- run integration test',
};

describe('fix-pr/parseFixPr', () => {
  it('parses a well-formed JSON response', () => {
    const fix = parseFixPr(JSON.stringify(VALID));
    expect(fix.branchName).toBe('fix/stripe-retry-backoff');
    expect(fix.files).toHaveLength(1);
  });

  it('strips surrounding text and code fences', () => {
    const wrapped = '```json\n' + JSON.stringify(VALID) + '\n```\nsome trailing text';
    const fix = parseFixPr(wrapped);
    expect(fix.prTitle).toContain('reduce Stripe');
  });

  it('rejects payloads missing required fields', () => {
    expect(() => parseFixPr('{"summary":"x"}')).toThrow();
    expect(() => parseFixPr('{"branchName":"x","files":[],"summary":"x","prTitle":"x","prBody":"x"}')).toThrow();
  });
});

describe('fix-pr/renderPatch', () => {
  it('concatenates per-file patches with trailing newline', () => {
    const patch = renderPatch(VALID);
    expect(patch).toContain('--- a/src/payments/client.ts');
    expect(patch.endsWith('\n')).toBe(true);
  });
});
