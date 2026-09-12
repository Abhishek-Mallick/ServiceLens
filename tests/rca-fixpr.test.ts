import { describe, expect, it } from 'vitest';
import { buildPrompt, type RcaContext } from '../lib/rca';
import { parseModelFix, buildChanges, gitBlobSha, pickCandidateFiles, branchNameFor, renderPatch } from '../lib/fix-pr';

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

const MODEL_OK = {
  summary: 'Reduce Stripe retry storm',
  prTitle: 'fix(payments): reduce Stripe retries',
  prBody: '## Why\nObserved repeated 503s under load.\n## What changed\n- RETRIES 5 → 2\n## How to test\n- run integration test',
  files: [{ path: 'src/payments/client.ts', content: 'export const RETRIES = 2;\n' }],
};

describe('fix-pr/parseModelFix', () => {
  it('parses a well-formed response', () => {
    const fix = parseModelFix(JSON.stringify(MODEL_OK));
    expect('files' in fix && fix.files).toHaveLength(1);
  });

  it('strips surrounding text and code fences', () => {
    const fix = parseModelFix('```json\n' + JSON.stringify(MODEL_OK) + '\n```\nsome trailing text');
    expect('prTitle' in fix && fix.prTitle).toContain('Stripe');
  });

  it('accepts an explicit "no code change" answer', () => {
    expect(parseModelFix('{"noChange":true,"reason":"The database is down"}')).toEqual({ noChange: true, reason: 'The database is down' });
  });

  it('rejects malformed payloads', () => {
    expect(() => parseModelFix('{"summary":"x"}')).toThrow();
    expect(() => parseModelFix(JSON.stringify({ ...MODEL_OK, files: [] }))).toThrow();
  });
});

describe('fix-pr/buildChanges', () => {
  const original = 'const a = 1;\nexport const RETRIES = 5;\nconst b = 2;\n';
  const originals = new Map([['src/x.ts', original]]);

  it('computes a real unified diff and records the original blob SHA', () => {
    const [c] = buildChanges([{ path: 'src/x.ts', content: original.replace('5', '2') }], originals);
    expect(c.patch.startsWith('--- a/src/x.ts')).toBe(true);
    expect(c.patch).toContain('-export const RETRIES = 5;');
    expect(c.patch).toContain('+export const RETRIES = 2;');
    expect(c.blobSha).toBe(gitBlobSha(original));
  });

  it('restores a trailing newline the model dropped instead of diffing it', () => {
    const [c] = buildChanges([{ path: 'src/x.ts', content: original.replace('5', '2').trimEnd() }], originals);
    expect(c.content.endsWith('\n')).toBe(true);
    expect(c.patch).not.toContain('No newline');
  });

  it('refuses edits to files the model was not given', () => {
    expect(() => buildChanges([{ path: 'src/other.ts', content: 'x' }], originals)).toThrow(/not given/);
  });

  it('reports "no change" when the content is identical', () => {
    expect(() => buildChanges([{ path: 'src/x.ts', content: original }], originals)).toThrow(/unchanged/);
  });

  it('refuses wholesale rewrites', () => {
    const big = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n') + '\n';
    const rewritten = Array.from({ length: 60 }, (_, i) => `other ${i}`).join('\n') + '\n';
    expect(() => buildChanges([{ path: 'big.ts', content: rewritten }], new Map([['big.ts', big]]))).toThrow(/rewrote most/);
  });
});

describe('fix-pr/gitBlobSha', () => {
  it('matches `git hash-object`', () => {
    expect(gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});

describe('fix-pr/pickCandidateFiles', () => {
  const contract = {
    endpoints: [
      { method: 'GET', path: '/api/products', file: 'src/routes/productRoutes.js', line: 3 },
      { method: 'GET', path: '/health', file: 'src/app.js', line: 10 },
    ],
    outboundDeps: [
      { envVar: 'PRODUCT_SERVICE_URL', file: 'src/clients/serviceUrls.js', line: 3 },
      { envVar: 'X_URL', file: '.env.example', line: 1 },
    ],
  };
  const existing = new Set(['src/routes/productRoutes.js', 'src/app.js', 'src/clients/serviceUrls.js', '.env.example']);

  it('ranks the files the RCA points at first and never offers env files', () => {
    const files = pickCandidateFiles(contract, 'Timeouts calling PRODUCT_SERVICE_URL from serviceUrls.js', existing);
    expect(files[0]).toBe('src/clients/serviceUrls.js');
    expect(files).not.toContain('.env.example');
  });

  it('ignores files that no longer exist at HEAD', () => {
    expect(pickCandidateFiles(contract, '', new Set(['src/app.js']))).toEqual(['src/app.js']);
  });
});

describe('fix-pr/branchNameFor', () => {
  it('always uses the servicelens/ prefix and a safe slug', () => {
    expect(branchNameFor('cmabcdef12345678', 'Fix: Stripe retry storm!!')).toBe('servicelens/incident-12345678-fix-stripe-retry-storm');
  });
});

describe('fix-pr/renderPatch', () => {
  it('concatenates per-file patches with a trailing newline', () => {
    const patch = renderPatch({ files: [{ path: 'a', patch: '--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+y' }] });
    expect(patch).toContain('--- a/a');
    expect(patch.endsWith('\n')).toBe(true);
  });
});
