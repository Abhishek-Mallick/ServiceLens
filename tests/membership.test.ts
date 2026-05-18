import { describe, expect, it } from 'vitest';
import { atLeast } from '../lib/membership';
import { validateRepoUrl } from '../lib/git-analyzer';

describe('membership/atLeast', () => {
  it('owner >= editor >= viewer', () => {
    expect(atLeast('owner', 'viewer')).toBe(true);
    expect(atLeast('owner', 'editor')).toBe(true);
    expect(atLeast('owner', 'owner')).toBe(true);
    expect(atLeast('editor', 'viewer')).toBe(true);
    expect(atLeast('editor', 'editor')).toBe(true);
    expect(atLeast('viewer', 'viewer')).toBe(true);
  });

  it('lower roles do not satisfy higher requirements', () => {
    expect(atLeast('viewer', 'editor')).toBe(false);
    expect(atLeast('viewer', 'owner')).toBe(false);
    expect(atLeast('editor', 'owner')).toBe(false);
  });

  it('null / unknown roles fail closed', () => {
    expect(atLeast(null, 'viewer')).toBe(false);
    expect(atLeast(undefined, 'viewer')).toBe(false);
    expect(atLeast('admin', 'viewer')).toBe(false);
  });
});

describe('git-analyzer/validateRepoUrl', () => {
  it('accepts http(s) public hosts', () => {
    expect(validateRepoUrl('https://github.com/org/repo')).toEqual({ ok: true, url: expect.any(URL) });
    expect(validateRepoUrl('http://gitlab.example.com/x.git')).toEqual({ ok: true, url: expect.any(URL) });
  });

  it('rejects malformed URLs', () => {
    const r = validateRepoUrl('not a url');
    expect(r.ok).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    const r = validateRepoUrl('ssh://git@github.com/org/repo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/protocol/);
  });

  it('rejects loopback + private hosts', () => {
    for (const u of [
      'http://localhost/repo',
      'http://127.0.0.1/repo',
      'http://10.0.0.5/repo',
      'http://192.168.1.1/repo',
      'http://172.16.0.5/repo',
      'http://169.254.169.254/repo', // AWS metadata
    ]) {
      const r = validateRepoUrl(u);
      expect(r.ok, `expected ${u} to be rejected`).toBe(false);
    }
  });
});
