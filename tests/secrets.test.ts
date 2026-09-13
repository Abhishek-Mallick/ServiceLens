import { describe, it, expect, beforeAll } from 'vitest';
import { decryptSecret, encryptSecret, isEncrypted, maskWebhook, redactUrl } from '@/lib/secrets';

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('secrets at rest', () => {
  it('round-trips and never stores the plaintext', () => {
    const plain = 'postgres://app:hunter2@db.example.com:5432/prod';
    const enc = encryptSecret(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain('hunter2');
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('uses a fresh IV every time', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('detects tampering', () => {
    const enc = encryptSecret('secret-value');
    const parts = enc.split('.');
    parts[2] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('fails with the wrong key', () => {
    const enc = encryptSecret('secret-value');
    process.env.SECRETS_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => decryptSecret(enc)).toThrow();
    process.env.SECRETS_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('passes legacy plaintext and null through', () => {
    expect(decryptSecret('https://hooks.slack.com/services/T/B/x')).toBe('https://hooks.slack.com/services/T/B/x');
    expect(decryptSecret(null)).toBeNull();
  });

  it('redacts passwords and secret-looking query params', () => {
    expect(redactUrl('postgres://app:hunter2@db:5432/prod?sslmode=require')).toBe('postgres://app:***@db:5432/prod?sslmode=require');
    expect(redactUrl('rediss://default:pw@cache:6379?token=abc')).toBe('rediss://default:***@cache:6379?token=***');
    expect(redactUrl('not a url')).toBe('***');
  });

  it('masks webhook URLs', () => {
    expect(maskWebhook('https://hooks.slack.com/services/T0ABCDEF/B0XYZ/secret')).toBe('https://hooks.slack.com/services/T0AB…');
    expect(maskWebhook(null)).toBeNull();
  });
});
