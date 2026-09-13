import { prisma } from './prisma';
import { stringify } from './utils';
import { dispatch, parseChannels } from './notify';
import type { Severity } from './notify';
import { snapshotForIncident } from './logs';
import { publish } from './realtime';
import { assertDemoArchitecture } from './demo';
import { kick } from './jobs';

export interface OpenIncidentInput {
  architectureId: string;
  ruleId?: string | null;
  serviceId?: string | null;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  summary?: string;
  source?: 'rule' | 'synthetic' | 'manual';
  simulated?: boolean;
  byUserId?: string | null;
}

// Dedup: at most one open incident per (ruleId, serviceId) pair. If a duplicate
// open exists we silently no-op so probe loops don't spam.
export async function openIncident(input: OpenIncidentInput): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.incident.findFirst({
    where: {
      architectureId: input.architectureId,
      ruleId: input.ruleId ?? null,
      serviceId: input.serviceId ?? null,
      status: { in: ['open', 'acknowledged', 'mitigated'] },
    },
    orderBy: { openedAt: 'desc' },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  // One outage, one incident: if another rule already has an open incident for
  // this service, attach this alert to it (and raise severity if needed)
  // instead of opening a second incident and paging twice.
  if (input.serviceId && (input.source ?? 'rule') === 'rule') {
    const open = await prisma.incident.findFirst({
      where: { architectureId: input.architectureId, serviceId: input.serviceId, status: { in: ['open', 'acknowledged', 'mitigated'] } },
      orderBy: { openedAt: 'desc' },
      select: { id: true, severity: true, events: { where: { type: 'related_alert' }, select: { payload: true } } },
    });
    if (open) {
      const already = input.ruleId && open.events.some((e) => e.payload?.includes(`"ruleId":"${input.ruleId}"`));
      if (!already) {
        const rank = { info: 0, warning: 1, critical: 2 } as const;
        const raise = rank[input.severity] > rank[open.severity as keyof typeof rank];
        await prisma.incidentEvent.create({
          data: { incidentId: open.id, type: 'related_alert', payload: stringify({ ruleId: input.ruleId ?? null, title: input.title, severity: input.severity, summary: input.summary ?? null }) },
        });
        if (raise) {
          await prisma.incident.update({ where: { id: open.id }, data: { severity: input.severity } });
          await prisma.incidentEvent.create({ data: { incidentId: open.id, type: 'severity_raised', payload: stringify({ from: open.severity, to: input.severity }) } });
        }
        publish(input.architectureId, 'incident_updated', { incidentId: open.id, relatedAlert: input.title });
      }
      return { id: open.id, created: false };
    }
  }

  const incident = await prisma.incident.create({
    data: {
      architectureId: input.architectureId,
      ruleId: input.ruleId ?? null,
      serviceId: input.serviceId ?? null,
      title: input.title,
      severity: input.severity,
      summary: input.summary ?? null,
      source: input.source ?? 'rule',
      simulated: input.simulated ?? false,
    },
  });
  await prisma.incidentEvent.create({
    data: {
      incidentId: incident.id,
      type: 'opened',
      payload: stringify({ severity: input.severity, source: input.source ?? 'rule' }),
      byUserId: input.byUserId ?? null,
    },
  });

  // Snapshot logs from the affected service + 1-hop neighbors. Fire-and-forget;
  // never block the probe loop on log capture.
  void snapshotForIncident(input.serviceId ?? null)
    .then((snapshot) =>
      prisma.incidentEvent.create({
        data: {
          incidentId: incident.id,
          type: 'log_snapshot',
          payload: stringify(snapshot),
        },
      })
    )
    .catch((err) => console.error('[incidents] log snapshot failed:', err));

  publish(input.architectureId, 'incident_opened', {
    incidentId: incident.id,
    title: incident.title,
    severity: incident.severity,
    serviceId: incident.serviceId ?? null,
    simulated: incident.simulated,
  });

  // On-call assignment, notifications, escalation and RCA run as a durable job
  // so a flaky webhook or LLM never blocks the probe loop and nothing is lost
  // if this process dies.
  await kick('incident_opened', { incidentId: incident.id });
  return { id: incident.id, created: true };
}

export type IncidentTemplate = 'IncidentOpened' | 'IncidentAcknowledged' | 'IncidentResolved' | 'IncidentEscalated' | 'FixPRReady';

export async function notifyForIncident(incidentId: string, template: IncidentTemplate) {
  const inc = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      rule: true,
      service: { select: { name: true } },
      oncall: true,
      remediations: { where: { status: 'opened' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!inc) return;
  const pr = inc.remediations[0];
  const channels = parseChannels(inc.rule?.channels);
  const title =
    template === 'IncidentOpened' ? `[${inc.severity.toUpperCase()}] ${inc.title}` :
    template === 'IncidentEscalated' ? `[ESCALATED] ${inc.title}` :
    template === 'FixPRReady' ? `Fix PR opened: ${inc.title}` :
    template === 'IncidentAcknowledged' ? `Acknowledged: ${inc.title}` :
    `Resolved: ${inc.title}`;
  const openedMin = Math.max(1, Math.round((Date.now() - inc.openedAt.getTime()) / 60_000));
  const body =
    template === 'FixPRReady' && pr
      ? `${pr.draft ? 'Draft pull request' : 'Pull request'} ${pr.repoFullName}#${pr.prNumber}: ${pr.title ?? ''} — ${pr.prUrl}. Review before merging; ServiceLens never merges.`
      : template === 'IncidentResolved' && inc.resolution
      ? `Resolution: ${inc.resolution}`
      : template === 'IncidentEscalated'
        ? `Still unacknowledged after ${openedMin} min.${inc.oncall ? ` ${inc.oncall.name} (${inc.oncall.email}) was paged first.` : ''} ${inc.summary ?? ''}`.trim()
        : inc.summary ?? '';
  await dispatch({
    architectureId: inc.architectureId,
    incidentId: inc.id,
    template,
    title,
    body,
    severity: inc.severity as Severity,
    href: `/architectures/${inc.architectureId}/incidents/${inc.id}`,
    channels,
  });
}

export async function ackIncident(incidentId: string, byUserId: string | null, byEmail?: string | null): Promise<void> {
  const updated = await prisma.incident.updateMany({
    where: { id: incidentId, status: { in: ['open'] } },
    data: { status: 'acknowledged', ackedAt: new Date(), assigneeId: byUserId ?? undefined },
  });
  if (updated.count === 0) return;
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'acked', byUserId, payload: byEmail ? stringify({ via: 'magic-link', email: byEmail }) : null },
  });
  const inc = await prisma.incident.findUnique({ where: { id: incidentId }, select: { architectureId: true } });
  if (inc) publish(inc.architectureId, 'incident_updated', { incidentId, status: 'acknowledged' });
  await kick('notify', { incidentId, template: 'IncidentAcknowledged' });
}

export async function resolveIncident(incidentId: string, byUserId: string | null, resolution?: string): Promise<void> {
  const updated = await prisma.incident.updateMany({
    where: { id: incidentId, status: { not: 'resolved' } },
    data: { status: 'resolved', resolvedAt: new Date(), resolution: resolution ?? null },
  });
  if (updated.count === 0) return;
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'resolved', byUserId, payload: resolution ? stringify({ resolution }) : null },
  });
  const inc = await prisma.incident.findUnique({ where: { id: incidentId }, select: { architectureId: true } });
  if (inc) publish(inc.architectureId, 'incident_resolved', { incidentId });
  await kick('notify', { incidentId, template: 'IncidentResolved' });
}

export async function resolveIncidentForRule(ruleId: string, serviceId: string | null, reason: 'auto' | 'manual'): Promise<void> {
  const open = await prisma.incident.findMany({
    where: { ruleId, serviceId, status: { in: ['open', 'acknowledged', 'mitigated'] } },
    select: { id: true, architectureId: true },
  });
  for (const i of open) {
    const updated = await prisma.incident.updateMany({
      where: { id: i.id, status: { not: 'resolved' } },
      // No `resolution` text: that field feeds runbook memory and should only hold human notes.
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    if (updated.count === 0) continue;
    await prisma.incidentEvent.create({
      data: { incidentId: i.id, type: 'resolved', payload: stringify({ reason }) },
    });
    publish(i.architectureId, 'incident_resolved', { incidentId: i.id, reason });
    await kick('notify', { incidentId: i.id, template: 'IncidentResolved' });
  }
}

export async function assignIncident(incidentId: string, assigneeId: string | null, byUserId: string | null): Promise<void> {
  await prisma.incident.update({
    where: { id: incidentId },
    data: { assigneeId },
  });
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'assigned', byUserId, payload: stringify({ assigneeId }) },
  });
}

export async function commentOnIncident(incidentId: string, byUserId: string | null, text: string): Promise<void> {
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'comment', byUserId, payload: stringify({ text }) },
  });
}

// Synthetic incident: opens immediately and (optionally) schedules an auto-resolve.
export async function triggerSyntheticIncident(input: {
  architectureId: string;
  serviceId: string;
  durationSec?: number;
  byUserId: string | null;
}): Promise<{ id: string }> {
  await assertDemoArchitecture(input.architectureId, 'Synthetic incidents');
  const svc = await prisma.service.findUnique({ where: { id: input.serviceId }, select: { name: true } });
  const opened = await openIncident({
    architectureId: input.architectureId,
    serviceId: input.serviceId,
    title: `Synthetic incident — ${svc?.name ?? 'service'} forced down`,
    severity: 'critical',
    summary: `Manual chaos drill: ${svc?.name ?? 'service'} flagged as down for ${input.durationSec ?? 300}s.`,
    source: 'synthetic',
    simulated: true,
    byUserId: input.byUserId,
  });
  // Force service status down for visibility.
  await prisma.service.update({
    where: { id: input.serviceId },
    data: { healthStatus: 'down', lastHealthCheck: new Date(), simulated: true },
  });
  await prisma.healthRecord.create({
    data: {
      serviceId: input.serviceId,
      status: 'down',
      responseTime: null,
      simulated: true,
      details: stringify({ synthetic: true, incidentId: opened.id }),
    },
  });
  return { id: opened.id };
}
