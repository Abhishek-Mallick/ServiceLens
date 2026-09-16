import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetPool,
  pickCredential,
  markFailed,
  isRateLimited,
  hasWorkersAiCredentials,
  credentialCount,
  classifyWorkersAiResponse,
  parseRetryAfterMs,
  credentialKey,
  type WorkersAiCredential,
} from '../lib/workers-ai-keys';

const C1: WorkersAiCredential = { accountId: 'acc1', token: 'tok1' };
const C2: WorkersAiCredential = { accountId: 'acc2', token: 'tok2' };
const C3: WorkersAiCredential = { accountId: 'acc3', token: 'tok3' };

describe('workers-ai-keys/pool basics', () => {
  beforeEach(() => __resetPool([C1, C2, C3]));

  it('reports pool size', () => {
    expect(credentialCount()).toBe(3);
    expect(hasWorkersAiCredentials()).toBe(true);
  });

  it('round-robins through every credential', () => {
    expect(pickCredential()).toEqual(C1);
    expect(pickCredential()).toEqual(C2);
    expect(pickCredential()).toEqual(C3);
    expect(pickCredential()).toEqual(C1);
  });

  it('skips credentials that have been marked failed', () => {
    markFailed(C2);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) seen.add(credentialKey(pickCredential()!));
    expect(seen.has(credentialKey(C2))).toBe(false);
    expect(seen.has(credentialKey(C1))).toBe(true);
    expect(seen.has(credentialKey(C3))).toBe(true);
  });

  it('returns null when every credential is cooling down', () => {
    markFailed(C1);
    markFailed(C2);
    markFailed(C3);
    expect(pickCredential()).toBeNull();
  });

  it('empty pool returns null', () => {
    __resetPool([]);
    expect(hasWorkersAiCredentials()).toBe(false);
    expect(pickCredential()).toBeNull();
  });
});

describe('workers-ai-keys/isRateLimited', () => {
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

describe('workers-ai-keys/classifyWorkersAiResponse', () => {
  it('retries 429 and marks the credential failed', () => {
    expect(classifyWorkersAiResponse(429, '', 5_000)).toEqual({
      action: 'retry',
      rotateCredential: true,
      waitMs: 5_000,
      markCredentialFailed: true,
    });
  });

  it('retries generic 503 without marking the credential failed', () => {
    expect(classifyWorkersAiResponse(503, 'upstream unavailable', null)).toEqual({
      action: 'retry',
      rotateCredential: false,
      waitMs: 3_000,
      markCredentialFailed: false,
    });
  });

  it('fails fast on client errors', () => {
    expect(classifyWorkersAiResponse(404, 'model not found', null)).toEqual({
      action: 'fail',
      message: 'Workers AI error 404: model not found',
    });
  });
});

describe('workers-ai-keys/parseRetryAfterMs', () => {
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
