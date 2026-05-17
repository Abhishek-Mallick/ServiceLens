import { describe, expect, it, beforeAll } from 'vitest';
import { signAckToken, verifyAckToken } from '../lib/notify/tokens';

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'test-secret-must-be-at-least-32-chars-long-xxx';
});

describe('notify/tokens', () => {
  it('round-trips incidentId and userId', () => {
    const token = signAckToken('inc_abc', 'user_xyz');
    const payload = verifyAckToken(token);
    expect(payload.incidentId).toBe('inc_abc');
    expect(payload.userId).toBe('user_xyz');
  });

  it('round-trips with null user', () => {
    const token = signAckToken('inc_abc', null);
    const payload = verifyAckToken(token);
    expect(payload.userId).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const token = signAckToken('inc_abc', 'user_xyz');
    const tampered = token.slice(0, -3) + 'aaa';
    expect(() => verifyAckToken(tampered)).toThrow();
  });

  it('rejects empty strings', () => {
    expect(() => verifyAckToken('')).toThrow();
  });
});
