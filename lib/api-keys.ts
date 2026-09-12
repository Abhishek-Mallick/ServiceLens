// Architecture-scoped API keys for programmatic onboarding (CI pipelines,
// agents following /SKILL.md). Format: `slk_` + 32 url-safe random chars.
// Only the SHA-256 is stored — keys are high-entropy, so a slow hash adds nothing.

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';

const KEY_RE = /^slk_[A-Za-z0-9_-]{32}$/;
const RATE_LIMIT_PER_MIN = 120;

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `slk_${crypto.randomBytes(24).toString('base64url')}`;
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

export function extractBearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m && KEY_RE.test(m[1]) ? m[1] : null;
}

// In-memory per-key limiter (per instance). Good enough to stop a runaway CI loop.
const buckets = new Map<string, { windowStart: number; count: number }>();
export function overRateLimit(keyId: string, now = Date.now()): boolean {
  const b = buckets.get(keyId);
  if (!b || now - b.windowStart >= 60_000) {
    buckets.set(keyId, { windowStart: now, count: 1 });
    return false;
  }
  b.count++;
  return b.count > RATE_LIMIT_PER_MIN;
}

export interface ApiKeyAuth {
  keyId: string;
  architectureId: string;
}

// Authenticates a v1 request. Returns the auth context, or a ready-made error response.
export async function apiKeyAuth(req: Request): Promise<ApiKeyAuth | NextResponse> {
  const key = extractBearer(req.headers.get('authorization'));
  if (!key) return v1Error(401, 'unauthorized', 'Send an API key: Authorization: Bearer slk_…');
  const row = await prisma.apiKey.findUnique({ where: { hash: hashApiKey(key) }, include: { architecture: { select: { demo: true } } } });
  if (!row || row.revokedAt) return v1Error(401, 'unauthorized', 'Unknown or revoked API key.');
  if (row.architecture.demo) return v1Error(403, 'forbidden', 'API keys cannot manage the demo architecture.');
  if (overRateLimit(row.id)) return v1Error(429, 'rate_limited', `Too many requests (limit ${RATE_LIMIT_PER_MIN}/min per key).`);
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { keyId: row.id, architectureId: row.architectureId };
}

export function v1Error(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}
