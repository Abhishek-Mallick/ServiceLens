import { describe, it, expect } from 'vitest';
import { composeResolutionSummary, extractRootCause, formatSpan } from '@/lib/runbook';

const RCA = [
  '## Likely root cause',
  'Calls from orders to **PAYMENTS_SERVICE_URL** time out: `TIMEOUT_MS` is 500ms,',
  'while payments p99 is about 1.8s.',
  '',
  '## Evidence',
  '- Health checks flipped to down.',
].join('\n');

describe('runbook summary', () => {
  it('extracts the first root-cause paragraph as plain text', () => {
    expect(extractRootCause(RCA)).toBe('Calls from orders to PAYMENTS_SERVICE_URL time out: TIMEOUT_MS is 500ms, while payments p99 is about 1.8s.');
    expect(extractRootCause('## Evidence\n- nothing')).toBeNull();
    expect(extractRootCause(null)).toBeNull();
    expect(extractRootCause(`## Root cause\n${'x'.repeat(600)}`, 50)).toHaveLength(50);
  });

  it('formats durations', () => {
    expect(formatSpan(20_000)).toBe('under a minute');
    expect(formatSpan(12 * 60_000)).toBe('12 min');
    expect(formatSpan(125 * 60_000)).toBe('2 h 5 min');
    expect(formatSpan(120 * 60_000)).toBe('2 h');
  });

  it('composes a facts-only summary for an auto-resolved incident with a fix PR', () => {
    const openedAt = new Date('2026-09-13T10:00:00Z');
    const s = composeResolutionSummary({
      openedAt,
      resolvedAt: new Date('2026-09-13T10:14:00Z'),
      reason: 'auto',
      ackedAt: new Date('2026-09-13T10:02:00Z'),
      ackedBy: 'olivia@ext.test',
      rootCause: 'Payments client timeout too low.',
      relatedAlerts: 1,
      fixPr: { number: 7, url: 'https://github.com/acme/orders/pull/7', title: 'fix: raise timeout', state: 'merged' },
    });
    expect(s).toBe(
      'Recovered after 14 min: health checks passed again and ServiceLens auto-resolved it. ' +
        'Acknowledged by olivia@ext.test after 2 min. Likely cause (RCA): Payments client timeout too low. ' +
        'Fix: PR #7 "fix: raise timeout" (merged) https://github.com/acme/orders/pull/7 1 other alert fired alongside.'
    );
  });

  it('says what is missing instead of guessing', () => {
    const s = composeResolutionSummary({
      openedAt: new Date(0),
      resolvedAt: new Date(3 * 60_000),
      reason: 'manual',
      ackedAt: null,
      ackedBy: null,
      rootCause: null,
      relatedAlerts: 0,
      fixPr: null,
    });
    expect(s).toBe('Resolved manually after 3 min (no resolution note). Nobody acknowledged it. No code fix was opened.');
  });
});
