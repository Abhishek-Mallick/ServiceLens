// On-call directory: a Google Sheet (or any CSV) published to the web.
//
//   service_name,oncall_name,oncall_email,escalation_email
//   checkout,Alice Liu,alice@acme.com,sre-lead@acme.com
//   *,Platform On-call,platform@acme.com,
//
// `service_name` matches ServiceLens service names case-insensitively, ignoring
// punctuation and a trailing "service" ("Checkout Service" == "checkout-service"
// == "checkout"). A "*" row is the fallback for services without their own row.

import { prisma } from '@/lib/prisma';
import { parseJson, stringify } from '@/lib/utils';
import { guardedRequest, privateNetworksAllowed } from '@/lib/net-guard';
import { serviceKey } from './keys';

export { serviceKey };

export interface RosterEntry {
  service: string; // as written in the sheet
  key: string; // normalised match key
  name: string;
  email: string;
  escalationEmail: string | null;
}

export const ROSTER_MAX_AGE_MS = 5 * 60_000;
const REQUIRED = ['service_name', 'oncall_name', 'oncall_email'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// RFC 4180-ish: quoted fields, escaped quotes (""), CRLF/LF, BOM.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}


export function parseRoster(csv: string): { entries: RosterEntry[]; errors: string[] } {
  const rows = parseCsv(csv);
  if (rows.length === 0) return { entries: [], errors: ['The sheet is empty.'] };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { entries: [], errors: [`Missing column(s): ${missing.join(', ')}. Expected: service_name, oncall_name, oncall_email, escalation_email.`] };

  const col = (name: string) => header.indexOf(name);
  const entries: RosterEntry[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const service = (r[col('service_name')] ?? '').trim();
    const name = (r[col('oncall_name')] ?? '').trim();
    const email = (r[col('oncall_email')] ?? '').trim();
    const escRaw = col('escalation_email') >= 0 ? (r[col('escalation_email')] ?? '').trim() : '';
    if (!service) return errors.push(`Row ${line}: service_name is empty.`);
    if (!EMAIL_RE.test(email)) return errors.push(`Row ${line}: "${email}" is not a valid oncall_email.`);
    if (escRaw && !EMAIL_RE.test(escRaw)) return errors.push(`Row ${line}: "${escRaw}" is not a valid escalation_email.`);
    entries.push({ service, key: service === '*' ? '*' : serviceKey(service), name: name || email, email, escalationEmail: escRaw || null });
  });
  return { entries, errors };
}

export function findOncall(entries: RosterEntry[], serviceName: string | null | undefined): RosterEntry | null {
  if (serviceName) {
    const key = serviceKey(serviceName);
    const hit = entries.find((e) => e.key === key);
    if (hit) return hit;
  }
  return entries.find((e) => e.key === '*') ?? null;
}

export async function fetchRosterCsv(csvUrl: string): Promise<string> {
  // Public deployments require https; self-hosted internal sheets may use http.
  const scheme = privateNetworksAllowed() ? /^https?:\/\//i : /^https:\/\//i;
  if (!scheme.test(csvUrl)) throw new Error('The roster URL must use https://');
  const res = await guardedRequest(csvUrl, { timeoutMs: 10_000, maxBodyBytes: 1024 * 1024, maxRedirects: 5 });
  if (res.status !== 200) throw new Error(`Fetching the roster returned HTTP ${res.status}`);
  if (/^\s*<(!doctype|html)/i.test(res.body)) {
    throw new Error('Got an HTML page, not CSV. In Google Sheets use File → Share → Publish to web → Comma-separated values (.csv).');
  }
  return res.body;
}

// Re-fetch and cache. On failure the previous roster is kept and the error recorded.
export async function refreshRoster(architectureId: string): Promise<{ entries: RosterEntry[]; errors: string[] }> {
  const src = await prisma.oncallSource.findUnique({ where: { architectureId } });
  if (!src) return { entries: [], errors: ['No on-call directory configured.'] };
  try {
    const parsed = parseRoster(await fetchRosterCsv(src.csvUrl));
    await prisma.oncallSource.update({
      where: { architectureId },
      data: {
        rosterJson: stringify(parsed.entries),
        lastFetchedAt: new Date(),
        lastError: parsed.errors.length ? parsed.errors.slice(0, 5).join(' ') : null,
      },
    });
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.oncallSource.update({ where: { architectureId }, data: { lastError: message } });
    return { entries: parseJson<RosterEntry[]>(src.rosterJson, []), errors: [message] };
  }
}

// Cached roster, refreshed when older than ROSTER_MAX_AGE_MS. Never throws.
export async function currentRoster(architectureId: string): Promise<RosterEntry[]> {
  const src = await prisma.oncallSource.findUnique({ where: { architectureId } });
  if (!src) return [];
  const stale = !src.lastFetchedAt || Date.now() - src.lastFetchedAt.getTime() > ROSTER_MAX_AGE_MS;
  if (stale) return (await refreshRoster(architectureId)).entries;
  return parseJson<RosterEntry[]>(src.rosterJson, []);
}
