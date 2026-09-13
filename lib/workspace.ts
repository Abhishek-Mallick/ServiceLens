// Data for the architecture workspace: the live graph, per-service health
// numbers, open incidents, who's on call, and a recent-activity feed — plus
// the detail behind a single service drawer.

import { prisma } from './prisma';
import { parseJson } from './utils';
import { buildTopology } from './topology-builder';
import { computeContractTopology } from './analyze';
import { findOncall, type RosterEntry } from './oncall/roster';
import { search } from './logs';
import type { Endpoint } from './ingest/types';
import type { TopologyGraph } from './types';
import type { ActivityItem, OncallPerson, ServiceOverview, WorkspaceData, WorkspaceIncident, WorkspaceService } from './workspace-types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const OPEN = ['open', 'acknowledged', 'mitigated'];
const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────
export function uptimeRatio(counts: Array<{ status: string; count: number }>): number | null {
  const total = counts.reduce((n, c) => n + c.count, 0);
  if (total === 0) return null;
  const down = counts.filter((c) => c.status === 'down').reduce((n, c) => n + c.count, 0);
  return (total - down) / total;
}

// Nearest-rank percentile.
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function mergeActivity(lists: ActivityItem[][], limit = 30): ActivityItem[] {
  const seen = new Set<string>();
  const all: ActivityItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      all.push(item);
    }
  }
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function healthStats(filter: { serviceId: string } | { service: { architectureId: string } }) {
  const [groups, recent] = await Promise.all([
    prisma.healthRecord.groupBy({
      by: ['serviceId', 'status'],
      where: { ...filter, checkedAt: { gte: new Date(Date.now() - DAY) } },
      _count: { _all: true },
    }),
    prisma.healthRecord.findMany({
      where: { ...filter, checkedAt: { gte: new Date(Date.now() - HOUR) }, responseTime: { not: null } },
      select: { serviceId: true, responseTime: true },
    }),
  ]);
  const out = new Map<string, { uptime24h: number | null; p95Ms: number | null; checks24h: number }>();
  const ids = new Set([...groups.map((g) => g.serviceId), ...recent.map((r) => r.serviceId)]);
  for (const id of Array.from(ids)) {
    const counts = groups.filter((g) => g.serviceId === id).map((g) => ({ status: g.status, count: g._count._all }));
    out.set(id, {
      uptime24h: uptimeRatio(counts),
      p95Ms: percentile(recent.filter((r) => r.serviceId === id).map((r) => r.responseTime as number), 95),
      checks24h: counts.reduce((n, c) => n + c.count, 0),
    });
  }
  return out;
}

const EVENT_TITLE: Record<string, (t: string) => string> = {
  opened: (t) => `Incident opened: ${t}`,
  acked: (t) => `Acknowledged: ${t}`,
  resolved: (t) => `Resolved: ${t}`,
  escalated: (t) => `Escalated: ${t}`,
  fix_pr_opened: (t) => `Fix PR opened for ${t}`,
  fix_pr_merged: (t) => `Fix PR merged for ${t}`,
  related_alert: (t) => `Another alert joined: ${t}`,
};

const AUDIT_ACTIONS = ['service.add', 'service.update', 'service.delete', 'service.analyze', 'topology.edit', 'oncall.update'];

export async function loadWorkspace(architectureId: string): Promise<WorkspaceData> {
  const arch = await prisma.architecture.findUnique({
    where: { id: architectureId },
    select: {
      id: true,
      name: true,
      demo: true,
      topologyData: true,
      oncallSource: { select: { rosterJson: true } },
      services: {
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, framework: true, language: true, healthStatus: true, lastHealthCheck: true,
          deployedUrl: true, repoUrl: true, analysisStatus: true, simulated: true,
          contract: { select: { commitSha: true } },
        },
      },
    },
  });
  if (!arch) throw new Error('architecture not found');

  // Real architectures: always derive live (contracts + human decisions), so
  // the graph never lags behind a new service. The demo keeps its seeded graph.
  let graph: TopologyGraph;
  if (arch.demo) {
    graph = parseJson<TopologyGraph>(arch.topologyData, { nodes: [], edges: [] });
    if (graph.nodes.length === 0) graph = buildTopology(await prisma.service.findMany({ where: { architectureId } })).graph;
  } else {
    graph = (await computeContractTopology(architectureId)).topo.graph;
  }

  const since3d = new Date(Date.now() - 3 * DAY);
  const [stats, incidentsRaw, events, audits, runs] = await Promise.all([
    healthStats({ service: { architectureId } }),
    prisma.incident.findMany({
      where: { architectureId, status: { in: OPEN } },
      orderBy: { openedAt: 'desc' },
      take: 50,
      select: {
        id: true, title: true, severity: true, status: true, openedAt: true,
        service: { select: { id: true, name: true } },
        oncall: { select: { name: true, email: true } },
        remediations: { where: { status: 'opened' }, orderBy: { createdAt: 'desc' }, take: 1, select: { prUrl: true, prState: true } },
      },
    }),
    prisma.incidentEvent.findMany({
      where: { incident: { architectureId }, at: { gte: since3d }, type: { in: Object.keys(EVENT_TITLE) } },
      orderBy: { at: 'desc' },
      take: 40,
      select: { id: true, type: true, at: true, payload: true, incident: { select: { id: true, title: true, severity: true } } },
    }),
    prisma.auditEvent.findMany({
      where: { architectureId, at: { gte: since3d }, action: { in: AUDIT_ACTIONS } },
      orderBy: { at: 'desc' },
      take: 30,
      select: { id: true, action: true, at: true, targetId: true, payload: true, user: { select: { name: true, email: true } } },
    }),
    prisma.regressionRun.findMany({
      where: { architectureId, createdAt: { gte: since3d } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, status: true, passedSteps: true, totalSteps: true, failedSteps: true, createdAt: true, simulated: true, triggeredBy: true },
    }),
  ]);

  const incidents: WorkspaceIncident[] = incidentsRaw
    .map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      openedAt: i.openedAt.toISOString(),
      service: i.service,
      oncall: i.oncall,
      fixPr: i.remediations[0] ? { url: i.remediations[0].prUrl, state: i.remediations[0].prState } : null,
    }))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || b.openedAt.localeCompare(a.openedAt));
  const incidentBySvc = new Map<string, WorkspaceIncident>();
  for (const i of incidents) if (i.service && !incidentBySvc.has(i.service.id)) incidentBySvc.set(i.service.id, i);

  const roster = arch.demo ? [] : parseJson<RosterEntry[]>(arch.oncallSource?.rosterJson, []);
  const people = new Map<string, OncallPerson>();

  const services: WorkspaceService[] = arch.services.map((s) => {
    const st = stats.get(s.id);
    const oc = roster.length ? findOncall(roster, s.name) : null;
    if (oc) {
      const p = people.get(oc.email.toLowerCase()) ?? { name: oc.name, email: oc.email, services: [] };
      p.services.push(s.name);
      people.set(oc.email.toLowerCase(), p);
    }
    const inc = incidentBySvc.get(s.id);
    return {
      id: s.id,
      name: s.name,
      framework: s.framework,
      language: s.language,
      healthStatus: s.healthStatus,
      lastHealthCheck: iso(s.lastHealthCheck),
      deployedUrl: s.deployedUrl,
      repoUrl: s.repoUrl,
      commitSha: s.contract?.commitSha ?? null,
      analysisStatus: s.analysisStatus,
      simulated: s.simulated,
      uptime24h: st?.uptime24h ?? null,
      p95Ms: st?.p95Ms ?? null,
      checks24h: st?.checks24h ?? 0,
      openIncident: inc ? { id: inc.id, title: inc.title, severity: inc.severity, status: inc.status } : null,
      oncall: oc ? { name: oc.name, email: oc.email } : null,
    };
  });

  const base = `/architectures/${architectureId}`;
  const activity = mergeActivity([
    events.map((e) => {
      const p = parseJson<Record<string, unknown>>(e.payload, {});
      const title = e.type === 'related_alert' ? String(p.title ?? e.incident.title) : e.incident.title;
      return {
        id: `ev-${e.id}`,
        at: e.at.toISOString(),
        kind: e.type.startsWith('fix_pr') ? ('fix' as const) : ('incident' as const),
        title: EVENT_TITLE[e.type](title),
        detail: e.type === 'escalated' && p.to ? `paged ${String(p.to)}` : null,
        href: `${base}/incidents/${e.incident.id}`,
        severity: e.incident.severity,
      };
    }),
    audits.map((a) => {
      const p = parseJson<Record<string, unknown>>(a.payload, {});
      const who = a.user?.name ?? a.user?.email ?? (p.via === 'api_key' ? 'API key' : null);
      const title =
        a.action === 'service.add' ? `Service registered: ${String(p.name ?? '')}`
        : a.action === 'service.update' ? 'Service settings changed'
        : a.action === 'service.delete' ? `Service removed: ${String(p.name ?? '')}`
        : a.action === 'service.analyze' ? `Repositories analyzed: ${Number(p.analyzed ?? 0)} ok${Number(p.failed ?? 0) ? `, ${Number(p.failed)} failed` : ''}`
        : a.action === 'topology.edit' ? 'Dependency decision recorded'
        : 'On-call directory updated';
      const kind = a.action.startsWith('service.analyze') ? 'analysis' : a.action.startsWith('service') ? 'service' : a.action === 'topology.edit' ? 'topology' : 'oncall';
      return {
        id: `au-${a.id}`,
        at: a.at.toISOString(),
        kind: kind as ActivityItem['kind'],
        title,
        detail: who ? `by ${who}` : null,
        href: a.action.startsWith('service.') && a.action !== 'service.delete' && a.action !== 'service.analyze' && a.targetId ? `${base}/services/${a.targetId}` : null,
      };
    }),
    runs.map((r) => ({
      id: `run-${r.id}`,
      at: r.createdAt.toISOString(),
      kind: 'tests' as const,
      title: r.simulated
        ? `Simulated regression run: ${r.passedSteps}/${r.totalSteps} passed`
        : `Contract tests: ${r.passedSteps}/${r.totalSteps} passed${r.failedSteps ? `, ${r.failedSteps} failed` : ''}`,
      detail: r.triggeredBy && r.triggeredBy !== 'manual' ? r.triggeredBy : null,
      href: `${base}/regression/${r.id}`,
      severity: r.failedSteps ? 'warning' : null,
    })),
  ]);

  const counts = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
  for (const s of services) {
    const k = (s.healthStatus in counts ? s.healthStatus : 'unknown') as keyof typeof counts;
    counts[k] += 1;
  }

  return {
    architecture: { id: arch.id, name: arch.name, demo: arch.demo },
    graph,
    services,
    incidents,
    activity,
    oncall: { configured: !arch.demo && !!arch.oncallSource, people: Array.from(people.values()) },
    counts,
  };
}

function rcaExcerpt(md: string | null): string | null {
  if (!md) return null;
  const body = md.split(/^## /m).find((s) => /^likely root cause/i.test(s)) ?? md;
  const text = body.replace(/^likely root cause\s*/i, '').replace(/\s+/g, ' ').trim();
  return text ? (text.length > 280 ? `${text.slice(0, 277)}…` : text) : null;
}

export async function loadServiceOverview(serviceId: string, canEdit: boolean): Promise<ServiceOverview | null> {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true, name: true, framework: true, language: true, healthStatus: true, lastHealthCheck: true,
      deployedUrl: true, healthPath: true, repoUrl: true, branch: true, analysisStatus: true, simulated: true,
      heartbeatAt: true, architectureId: true,
      architecture: { select: { demo: true, oncallSource: { select: { rosterJson: true } } } },
      contract: { select: { endpoints: true } },
      probes: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, type: true, target: true, intervalSec: true, enabled: true, lastRunAt: true } },
      dependencies: { select: { details: true, dependency: { select: { id: true, name: true, healthStatus: true } } } },
      dependents: { select: { details: true, dependent: { select: { id: true, name: true, healthStatus: true } } } },
    },
  });
  if (!svc) return null;

  const [history, stats, incident, logs] = await Promise.all([
    prisma.healthRecord.findMany({
      where: { serviceId },
      orderBy: { checkedAt: 'desc' },
      take: 60,
      select: { status: true, responseTime: true, checkedAt: true, details: true },
    }),
    healthStats({ serviceId }),
    prisma.incident.findFirst({
      where: { serviceId, status: { in: OPEN } },
      orderBy: { openedAt: 'desc' },
      select: {
        id: true, title: true, severity: true, status: true, openedAt: true, rcaMarkdown: true,
        remediations: { where: { status: 'opened' }, orderBy: { createdAt: 'desc' }, take: 1, select: { prUrl: true } },
      },
    }),
    search({ architectureId: svc.architectureId, serviceIds: [serviceId], levels: ['warn', 'error'], since: new Date(Date.now() - DAY), limit: 20 }),
  ]);

  // Latest per-probe result lives in the newest aggregated health record.
  const latest = parseJson<{ results?: Array<{ probeId: string; status: string }> }>(history[0]?.details, {});
  const lastByProbe = new Map((latest.results ?? []).map((r) => [r.probeId, r.status]));
  const via = (details: string | null) => {
    const d = parseJson<{ envVar?: string; topic?: string; matchedBy?: string }>(details, {});
    return d.envVar ?? d.topic ?? (d.matchedBy === 'manual' ? 'added by hand' : null);
  };
  const endpoints = parseJson<Endpoint[]>(svc.contract?.endpoints, []);
  const roster = svc.architecture.demo ? [] : parseJson<RosterEntry[]>(svc.architecture.oncallSource?.rosterJson, []);
  const oc = roster.length ? findOncall(roster, svc.name) : null;
  const st = stats.get(serviceId);

  return {
    service: {
      id: svc.id, name: svc.name, framework: svc.framework, language: svc.language, healthStatus: svc.healthStatus,
      lastHealthCheck: iso(svc.lastHealthCheck), deployedUrl: svc.deployedUrl, healthPath: svc.healthPath, repoUrl: svc.repoUrl,
      branch: svc.branch, analysisStatus: svc.analysisStatus, simulated: svc.simulated, heartbeatAt: iso(svc.heartbeatAt),
    },
    stats: { uptime24h: st?.uptime24h ?? null, p95Ms: st?.p95Ms ?? null, checks24h: st?.checks24h ?? 0 },
    history: history.reverse().map((h) => ({ status: h.status, rt: h.responseTime, at: h.checkedAt.toISOString() })),
    probes: svc.probes.map((p) => ({ ...p, lastRunAt: iso(p.lastRunAt), lastStatus: lastByProbe.get(p.id) ?? null })),
    dependsOn: svc.dependencies.map((d) => ({ ...d.dependency, via: via(d.details) })),
    usedBy: svc.dependents.map((d) => ({ ...d.dependent, via: via(d.details) })),
    endpoints: { count: endpoints.length, sample: endpoints.slice(0, 8).map((e) => ({ method: e.method, path: e.path })) },
    incident: incident
      ? {
          id: incident.id, title: incident.title, severity: incident.severity, status: incident.status,
          openedAt: incident.openedAt.toISOString(), rcaExcerpt: rcaExcerpt(incident.rcaMarkdown),
          fixPrUrl: incident.remediations[0]?.prUrl ?? null,
        }
      : null,
    oncall: oc ? { name: oc.name, email: oc.email } : null,
    logs: logs.map((l) => ({ id: l.id, level: l.level, message: l.message, at: l.at.toISOString() })),
    canEdit: canEdit && !svc.architecture.demo,
  };
}
