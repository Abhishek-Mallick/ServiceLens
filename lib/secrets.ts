// Encryption at rest for credentials ServiceLens stores on users' behalf:
// datastore connection strings, probe headers, Slack webhook URLs.
//
// AES-256-GCM with a random 96-bit IV; values look like `enc:v1:<iv>.<tag>.<ct>`.
// Key: SECRETS_ENCRYPTION_KEY (32 bytes, hex or base64). If unset, a key is
// derived from NEXTAUTH_SECRET via HKDF so things work out of the box — but
// then rotating NEXTAUTH_SECRET makes stored credentials unreadable, so set a
// dedicated key in production.
//
// decryptSecret() passes legacy plaintext through unchanged, so existing rows
// keep working and get encrypted the next time they're saved.

import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';

function key(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes (64 hex chars, or base64).');
    return buf;
  }
  const base = process.env.NEXTAUTH_SECRET;
  if (!base) throw new Error('Set SECRETS_ENCRYPTION_KEY (or NEXTAUTH_SECRET) before storing credentials.');
  return Buffer.from(new Uint8Array(crypto.hkdfSync('sha256', base, 'servicelens', 'secrets-v1', 32)));
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) return value; // legacy plaintext
  const [iv, tag, ct] = value.slice(PREFIX.length).split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// postgres://app:hunter2@db.example.com:5432/prod → postgres://app:***@db.example.com:5432/prod
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) u.password = '***';
    for (const k of Array.from(u.searchParams.keys())) {
      if (/pass|secret|token|key/i.test(k)) u.searchParams.set(k, '***');
    }
    return u.toString();
  } catch {
    return '***';
  }
}

// https://hooks.slack.com/services/T0ABC/B0DEF/xyz → https://hooks.slack.com/services/T0AB…
export function maskWebhook(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return `${u.origin}/${parts[0] ?? ''}/${(parts[1] ?? '').slice(0, 4)}…`;
  } catch {
    return '…';
  }
}
