// Runbook memory for incidents nobody wrote a resolution note for.
//
// When an incident resolves without a human note (auto-resolve on recovery,
// or a manual resolve with the note left empty), a `resolution_summary` job
// writes `Incident.resolutionSummary` from facts ServiceLens already holds:
// how long it lasted, who acknowledged it, the RCA's root cause and the fix PR.
// Nothing is invented — every clause comes from a stored record. Future RCAs and
// fix prompts read it as a prior resolution (lib/rca.ts), with human notes
// taking precedence.

import { prisma } from './prisma';
import { publish } from './realtime';
import { parseJson } from './utils';

export interface ResolutionFacts {
  openedAt: Date;
  resolvedAt: Date;
  reason: 'auto' | 'manual';
  ackedAt: Date | null;
  ackedBy: string | null;
  rootCause: string | null;
  relatedAlerts: number;
  fixPr: { number: number | null; url: string; title: string | null; state: string | null } | null;
}

export function formatSpan(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// First paragraph under the RCA's "root cause" heading, as plain text.
export function extractRootCause(markdown: string | null | undefined, max = 400): string | null {
  if (!markdown) return null;
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^#{1,4}\s.*root cause/i.test(l));
  if (start < 0) return null;
  const para: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,4}\s/.test(line)) break;
    if (!line.trim()) {
      if (para.length) break;
      continue;
    }
    para.push(line.trim().replace(/^[-*]\s+/, ''));
  }
  // Drop markdown emphasis/code marks but keep identifiers like PAYMENTS_SERVICE_URL.
  const text = para.join(' ').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function composeResolutionSummary(f: ResolutionFacts): string {
  const parts: string[] = [];
  const lasted = formatSpan(f.resolvedAt.getTime() - f.openedAt.getTime());
  parts.push(
    f.reason === 'auto'
      ? `Recovered after ${lasted}: health checks passed again and ServiceLens auto-resolved it.`
      : `Resolved manually after ${lasted} (no resolution note).`
  );
  if (f.ackedAt) {
    const by = f.ackedBy ? ` by ${f.ackedBy}` : '';
    parts.push(`Acknowledged${by} after ${formatSpan(f.ackedAt.getTime() - f.openedAt.getTime())}.`);
  } else {
    parts.push('Nobody acknowledged it.');
  }
  if (f.rootCause) parts.push(`Likely cause (RCA): ${f.rootCause}`);
  if (f.fixPr) {
    const label = f.fixPr.number ? `PR #${f.fixPr.number}` : 'A fix PR';
    const state = f.fixPr.state ? ` (${f.fixPr.state})` : '';
    const title = f.fixPr.title ? ` "${f.fixPr.title}"` : '';
    parts.push(`Fix: ${label}${title}${state} ${f.fixPr.url}`);
  } else {
    parts.push('No code fix was opened.');
  }
  if (f.relatedAlerts > 0) parts.push(`${f.relatedAlerts} other alert${f.relatedAlerts === 1 ? '' : 's'} fired alongside.`);
  return parts.join(' ');
}

export async function summarizeResolution(incidentId: string): Promise<string | null> {
  const inc = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      events: { orderBy: { at: 'asc' }, select: { type: true, payload: true, byUserId: true, at: true } },
      remediations: { where: { prUrl: { not: null } }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!inc || inc.status !== 'resolved' || !inc.resolvedAt) return null;
  if (inc.simulated || inc.resolution || inc.resolutionSummary) return null;

  const resolved = [...inc.events].reverse().find((e) => e.type === 'resolved');
  const reason = parseJson<{ reason?: string }>(resolved?.payload, {}).reason === 'auto' ? 'auto' : 'manual';
  const acked = inc.events.find((e) => e.type === 'acked');
  let ackedBy: string | null = parseJson<{ email?: string }>(acked?.payload, {}).email ?? null;
  if (acked?.byUserId && !ackedBy) {
    const u = await prisma.user.findUnique({ where: { id: acked.byUserId }, select: { name: true, email: true } });
    ackedBy = u?.name || u?.email || null;
  }
  const pr = inc.remediations[0];

  const summary = composeResolutionSummary({
    openedAt: inc.openedAt,
    resolvedAt: inc.resolvedAt,
    reason,
    ackedAt: inc.ackedAt,
    ackedBy,
    rootCause: extractRootCause(inc.rcaMarkdown),
    relatedAlerts: inc.events.filter((e) => e.type === 'related_alert').length,
    fixPr: pr?.prUrl ? { number: pr.prNumber, url: pr.prUrl, title: pr.title, state: pr.prState } : null,
  });

  const updated = await prisma.incident.updateMany({
    where: { id: incidentId, resolution: null, resolutionSummary: null },
    data: { resolutionSummary: summary },
  });
  if (updated.count) publish(inc.architectureId, 'incident_updated', { incidentId, status: 'resolved' });
  return summary;
}
