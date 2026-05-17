import { prisma } from './prisma';
import { stringify } from './utils';
import { dispatch, parseChannels } from './notify';
import type { Severity } from './notify';
import { snapshotForIncident } from './logs';

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

  // Notify (fire-and-forget — we don't want a flaky webhook to break the probe loop).
  void notifyForIncident(incident.id, 'IncidentOpened').catch((err) =>
    console.error('[incidents] dispatch IncidentOpened failed:', err)
  );
  return { id: incident.id, created: true };
}

async function notifyForIncident(incidentId: string, template: 'IncidentOpened' | 'IncidentAcknowledged' | 'IncidentResolved') {
  const inc = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { rule: true, service: { select: { name: true } } },
  });
  if (!inc) return;
  const channels = parseChannels(inc.rule?.channels);
  const title =
    template === 'IncidentOpened' ? `[${inc.severity.toUpperCase()}] ${inc.title}` :
    template === 'IncidentAcknowledged' ? `Acknowledged: ${inc.title}` :
    `Resolved: ${inc.title}`;
  const body =
    template === 'IncidentResolved' && inc.resolution
      ? `Resolution: ${inc.resolution}`
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

export async function ackIncident(incidentId: string, byUserId: string | null): Promise<void> {
  const updated = await prisma.incident.updateMany({
    where: { id: incidentId, status: { in: ['open'] } },
    data: { status: 'acknowledged', ackedAt: new Date(), assigneeId: byUserId ?? undefined },
  });
  if (updated.count === 0) return;
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'acked', byUserId, payload: null },
  });
  void notifyForIncident(incidentId, 'IncidentAcknowledged').catch((err) =>
    console.error('[incidents] dispatch IncidentAcknowledged failed:', err)
  );
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
  void notifyForIncident(incidentId, 'IncidentResolved').catch((err) =>
    console.error('[incidents] dispatch IncidentResolved failed:', err)
  );
}

export async function resolveIncidentForRule(ruleId: string, serviceId: string | null, reason: 'auto' | 'manual'): Promise<void> {
  const open = await prisma.incident.findMany({
    where: { ruleId, serviceId, status: { in: ['open', 'acknowledged', 'mitigated'] } },
    select: { id: true },
  });
  for (const i of open) {
    await prisma.incident.update({
      where: { id: i.id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    await prisma.incidentEvent.create({
      data: { incidentId: i.id, type: 'resolved', payload: stringify({ reason }) },
    });
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
