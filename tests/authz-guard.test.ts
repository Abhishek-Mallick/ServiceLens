// Static guard for multi-user authz. Architectures are shared via
// ArchitectureMember, so:
//   1. no query may scope an architecture to its creator only (`architecture: { userId }`,
//      `{ id: params.id, userId: session.user.id }`) — use visibleTo() / role helpers
//   2. every mutating API handler must check an editor/owner role, unless it is
//      explicitly listed below as user-scoped, public, or token-authenticated.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

// Mutations that intentionally don't check an architecture role.
const EXEMPT_MUTATIONS = new Set([
  'app/api/architectures/route.ts POST', // creates a new architecture owned by the caller
  'app/api/auth/register/route.ts POST', // public signup
  'app/api/cron/tick/route.ts POST', // CRON_SECRET-guarded
  'app/api/incidents/[incidentId]/comment/route.ts POST', // any member may comment
  'app/api/me/notification-pref/route.ts PUT', // caller's own prefs
  'app/api/notifications/[id]/read/route.ts POST', // caller's own notification
  'app/api/notifications/route.ts POST', // caller's own notifications
  'app/api/services/[serviceId]/logs/route.ts POST', // per-service bearer token
  'app/api/notify/ack/route.ts POST', // signed magic-link token
]);

describe('authz guard', () => {
  const files = walk(path.join(ROOT, 'app'));

  it('never scopes architecture access to the creator only', () => {
    const offenders: string[] = [];
    const patterns = [
      /architecture:\s*\{\s*(?:id:\s*[\w.]+,\s*)?userId\b/,
      /architecture\.(?:findFirst|findMany|deleteMany|updateMany)\(\{\s*where:\s*\{\s*id:\s*params\.id,\s*userId:/,
      /architecture\.findMany\(\{\s*where:\s*\{\s*userId:/,
    ];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      if (patterns.some((p) => p.test(s))) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('every mutating API handler checks an editor/owner role', () => {
    const offenders: string[] = [];
    for (const f of files.filter((x) => x.endsWith('route.ts') && rel(x).startsWith('app/api/'))) {
      const s = fs.readFileSync(f, 'utf8');
      const re = /export async function (POST|PATCH|PUT|DELETE)\b([\s\S]*?)(?=\nexport async function|$)/g;
      for (const m of Array.from(s.matchAll(re))) {
        const key = `${rel(f)} ${m[1]}`;
        if (EXEMPT_MUTATIONS.has(key)) continue;
        const guarded = /requireOwned\w+\([^)]*'(?:editor|owner)'\)|requireRole\(|loadOwned\(|apiKeyAuth\(/.test(m[2]);
        if (!guarded) offenders.push(key);
      }
    }
    expect(offenders).toEqual([]);
  });
});
