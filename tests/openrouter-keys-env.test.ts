import { describe, it, expect } from 'vitest';
import { parseKeys } from '@/lib/openrouter-keys';

describe('OpenRouter key configuration', () => {
  it('reads a single key', () => {
    expect(parseKeys({ OPENROUTER_API_KEY: 'sk-1' })).toEqual(['sk-1']);
  });

  it('reads a comma-separated pool', () => {
    expect(parseKeys({ OPENROUTER_API_KEYS: 'sk-1, sk-2,,sk-3 ' })).toEqual(['sk-1', 'sk-2', 'sk-3']);
  });

  it('ignores a blank pool variable next to a real single key', () => {
    // Regression: `KEYS ?? KEY` treated "" as configured and disabled AI entirely.
    expect(parseKeys({ OPENROUTER_API_KEYS: '', OPENROUTER_API_KEY: 'sk-1' })).toEqual(['sk-1']);
  });

  it('merges both variables without duplicates', () => {
    expect(parseKeys({ OPENROUTER_API_KEYS: 'sk-1,sk-2', OPENROUTER_API_KEY: 'sk-2' })).toEqual(['sk-1', 'sk-2']);
  });

  it('is empty when neither is set', () => {
    expect(parseKeys({})).toEqual([]);
    expect(parseKeys({ OPENROUTER_API_KEYS: ' ', OPENROUTER_API_KEY: '' })).toEqual([]);
  });
});
