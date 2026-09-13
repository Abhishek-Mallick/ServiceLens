import { describe, expect, it } from 'vitest';
import { atLeast } from '../lib/membership';

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
