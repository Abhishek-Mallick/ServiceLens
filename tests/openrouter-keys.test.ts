import { describe, expect, it, beforeEach } from 'vitest';
import { __resetPool, pickKey, markFailed, isRateLimited, hasOpenRouterKeys, keyCount, classifyOpenRouterResponse, parseRetryAfterMs } from '../lib/openrouter-keys';

describe('openrouter-keys/pool basics', () => {
  beforeEach(() => __resetPool(['k1', 'k2', 'k3']));

  it('reports pool size', () => {
    expect(keyCount()).toBe(3);
    expect(hasOpenRouterKeys()).toBe(true);
  });

  it('round-robins through every key', () => {
    expect(pickKey()).toBe('k1');
    expect(pickKey()).toBe('k2');
    expect(pickKey()).toBe('k3');
    expect(pickKey()).toBe('k1');
  });

  it('skips keys that have been marked failed', () => {
    markFailed('k2');
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) seen.add(pickKey()!);
    expect(seen.has('k2')).toBe(false);
    expect(seen.has('k1')).toBe(true);
    expect(seen.has('k3')).toBe(true);
  });

  it('returns null when every key is cooling down', () => {
    markFailed('k1');
    markFailed('k2');
    markFailed('k3');
    expect(pickKey()).toBeNull();
  });

  it('empty pool returns null', () => {
    __resetPool([]);
    expect(hasOpenRouterKeys()).toBe(false);
    expect(pickKey()).toBeNull();
  });
});

describe('openrouter-keys/isRateLimited', () => {
  it('recognizes a 429', () => {
    expect(isRateLimited(429, '')).toBe(true);
  });

  it('recognizes textual quota-exhausted bodies even on non-429', () => {
    expect(isRateLimited(200, 'rate limit exceeded')).toBe(true);
    expect(isRateLimited(403, 'quota exceeded for the day')).toBe(true);
    expect(isRateLimited(503, 'resource exhausted upstream')).toBe(true);
    expect(isRateLimited(500, 'too many requests, slow down')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isRateLimited(400, 'invalid request body')).toBe(false);
    expect(isRateLimited(404, 'model not found')).toBe(false);
    expect(isRateLimited(200, 'all good here')).toBe(false);
  });
});

describe('openrouter-keys/classifyOpenRouterResponse', () => {
  it('retries 429 and marks the key failed', () => {
    expect(classifyOpenRouterResponse(429, '', 5_000)).toEqual({
      action: 'retry',
      rotateKey: true,
      waitMs: 5_000,
      markKeyFailed: true,
    });
  });

  it('retries generic 503 without marking the key failed', () => {
    expect(classifyOpenRouterResponse(503, 'upstream unavailable', null)).toEqual({
      action: 'retry',
      rotateKey: false,
      waitMs: 3_000,
      markKeyFailed: false,
    });
  });

  it('fails fast on client errors', () => {
    expect(classifyOpenRouterResponse(404, 'model not found', null)).toEqual({
      action: 'fail',
      message: 'OpenRouter error 404: model not found',
    });
  });
});

describe('openrouter-keys/parseRetryAfterMs', () => {
  it('parses seconds', () => {
    const h = new Headers({ 'retry-after': '12' });
    expect(parseRetryAfterMs(h)).toBe(12_000);
  });

  it('parses HTTP dates', () => {
    const future = new Date(Date.now() + 4_000).toUTCString();
    const h = new Headers({ 'retry-after': future });
    expect(parseRetryAfterMs(h)).toBeGreaterThanOrEqual(3_000);
    expect(parseRetryAfterMs(h)).toBeLessThanOrEqual(4_000);
  });
});
