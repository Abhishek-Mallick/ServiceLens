// Root-cause-analysis pipeline.
//
// `assemblePrompt` gathers everything the model needs (incident metadata,
// affected service summary, health window, 1-hop neighbor health, captured
// logs snapshot from open-time, recent failed regression steps, and prior
// resolved incidents matched by keyword overlap — the runbook RAG-lite).
//
// `streamRca` calls the OpenRouter streaming wrapper, persists the assembled
// text into Incident.rcaMarkdown as it goes, and writes start/complete
// IncidentEvents for the timeline.

import { prisma } from './prisma';
import { parseJson } from './utils';
import { streamChat, currentModel, type ChatMessage } from './openrouter-stream';

const MAX_LOG_CHARS = 4000;
const MAX_SUMMARY_CHARS = 2000;
const MAX_PRIOR_INCIDENTS = 3;

export interface IncidentLike {
  id: string;
  title: string;
  severity: string;
  summary: string | null;
  serviceId: string | null;
  architectureId: string;
  openedAt: Date;
}

export interface RcaContext {
  incident: IncidentLike;
  architectureName: string;
  serviceName: string | null;
  serviceSummary: string | null;
  healthWindow: Array<{ status: string; rt: number | null; at: string }>;
  neighborHealth: Array<{ name: string; status: string; rt: number | null }>;
  logsSnapshot: Array<{ service: string; level: string; message: string; at: string }>;
  failedRegression: Array<{ service: string; step: string; error: string }>;
  priorResolved: Array<{ title: string; resolution: string; ageDays: number }>;
}

// Keyword-overlap ranking — cheap, no embeddings needed.
function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t))
  );
}
const STOPWORDS = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'into', 'over', 'when', 'where', 'they', 'them', 'service', 'incident', 'after', 'before']);

function overlapScore(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

export async function assembleContext(incidentId: string): Promise<RcaContext | null> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      architecture: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, summary: true } },
      events: { where: { type: 'log_snapshot' }, orderBy: { at: 'desc' }, take: 1 },
    },
  });
  if (!incident) return null;

  const since = new Date(Date.now() - 30 * 60 * 1000);
  const health = incident.serviceId
    ? await prisma.healthRecord.findMany({
        where: { serviceId: incident.serviceId, checkedAt: { gte: since } },
        orderBy: { checkedAt: 'asc' },
        select: { status: true, responseTime: true, checkedAt: true },
      })
    : [];

  // 1-hop neighbors via ServiceDependency
  const neighborIds = new Set<string>();
  if (incident.serviceId) {
    const deps = await prisma.serviceDependency.findMany({
      where: { OR: [{ dependentId: incident.serviceId }, { dependencyId: incident.serviceId }] },
      select: { dependentId: true, dependencyId: true },
    });
    for (const d of deps) {
      if (d.dependentId !== incident.serviceId) neighborIds.add(d.dependentId);
      if (d.dependencyId !== incident.serviceId) neighborIds.add(d.dependencyId);
    }
  }
  const neighbors = neighborIds.size
    ? await prisma.service.findMany({
        where: { id: { in: Array.from(neighborIds) } },
        select: { name: true, healthStatus: true, lastHealthCheck: true, healthHistory: { orderBy: { checkedAt: 'desc' }, take: 1, select: { responseTime: true } } },
      })
    : [];

  // Most recent failed regression steps on this architecture
  const recentRun = await prisma.regressionRun.findFirst({
    where: { architectureId: incident.architectureId },
    orderBy: { createdAt: 'desc' },
    include: {
      steps: {
        where: { status: 'failed' },
        take: 6,
        include: { service: { select: { name: true } } },
      },
    },
  });

  // Logs snapshot captured at incident open
  const snap = incident.events[0]?.payload ? parseJson<{ logs?: Array<{ service: string; level: string; message: string; at: string }> }>(incident.events[0].payload, { logs: [] }) : { logs: [] };

  // Prior resolved incidents on the same service (keyword overlap on title+summary)
  const priorAll = incident.serviceId
    ? await prisma.incident.findMany({
        where: {
          architectureId: incident.architectureId,
          status: 'resolved',
          serviceId: incident.serviceId,
          id: { not: incident.id },
          resolution: { not: null },
        },
        orderBy: { resolvedAt: 'desc' },
        take: 20,
        select: { title: true, summary: true, resolution: true, resolvedAt: true },
      })
    : [];

  const needle = tokens([incident.title, incident.summary ?? ''].join(' '));
  const ranked = priorAll
    .map((p) => ({
      p,
      score: overlapScore(needle, tokens([p.title, p.summary ?? ''].join(' '))),
    }))
    .filter((x) => x.score > 0 || priorAll.length <= MAX_PRIOR_INCIDENTS)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PRIOR_INCIDENTS);

  return {
    incident: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      summary: incident.summary,
      serviceId: incident.serviceId,
      architectureId: incident.architectureId,
      openedAt: incident.openedAt,
    },
    architectureName: incident.architecture.name,
    serviceName: incident.service?.name ?? null,
    serviceSummary: incident.service?.summary ?? null,
    healthWindow: health.map((h) => ({ status: h.status, rt: h.responseTime, at: h.checkedAt.toISOString() })),
    neighborHealth: neighbors.map((n) => ({ name: n.name, status: n.healthStatus, rt: n.healthHistory[0]?.responseTime ?? null })),
    logsSnapshot: (snap.logs ?? []).slice(0, 30),
    failedRegression: (recentRun?.steps ?? []).map((s) => ({ service: s.service.name, step: s.name, error: s.errorMessage ?? '' })),
    priorResolved: ranked.map(({ p }) => ({
      title: p.title,
      resolution: p.resolution ?? '',
      ageDays: p.resolvedAt ? Math.floor((Date.now() - p.resolvedAt.getTime()) / 86_400_000) : 0,
    })),
  };
}

export function buildPrompt(ctx: RcaContext): ChatMessage[] {
  const system = `You are a Site Reliability Engineer doing root-cause analysis on a production incident. You produce concise, evidence-grounded markdown reports. Always cite specific log lines, health checks, or regression steps you used. If evidence is thin, say so — do not invent root causes.`;

  const lines: string[] = [];
  lines.push(`# Incident`);
  lines.push(`Title: "${ctx.incident.title}"`);
  lines.push(`Severity: ${ctx.incident.severity}`);
  lines.push(`Architecture: "${ctx.architectureName}"`);
  if (ctx.serviceName) lines.push(`Service: "${ctx.serviceName}"`);
  if (ctx.serviceSummary) lines.push(`Service summary: ${ctx.serviceSummary.slice(0, MAX_SUMMARY_CHARS)}`);
  if (ctx.incident.summary) lines.push(`Rule summary: ${ctx.incident.summary}`);
  lines.push('');

  if (ctx.healthWindow.length > 0) {
    lines.push(`## Health window (last 30 min on affected service)`);
    const compact = ctx.healthWindow.slice(-20).map((h) => `${h.at} ${h.status}${h.rt != null ? ` (${h.rt}ms)` : ''}`);
    lines.push(compact.join('\n'));
    lines.push('');
  }

  if (ctx.neighborHealth.length > 0) {
    lines.push(`## 1-hop neighbor health`);
    lines.push(ctx.neighborHealth.map((n) => `- ${n.name}: ${n.status}${n.rt != null ? ` (${n.rt}ms)` : ''}`).join('\n'));
    lines.push('');
  }

  if (ctx.logsSnapshot.length > 0) {
    lines.push(`## Logs at incident open (warn/error)`);
    const body = ctx.logsSnapshot
      .map((l) => `[${l.at}] ${l.level.toUpperCase()} ${l.service}: ${l.message}`)
      .join('\n');
    lines.push(body.slice(0, MAX_LOG_CHARS));
    lines.push('');
  }

  if (ctx.failedRegression.length > 0) {
    lines.push(`## Recent failed regression steps`);
    lines.push(ctx.failedRegression.map((f) => `- [${f.service}] ${f.step} — ${f.error}`).join('\n'));
    lines.push('');
  }

  if (ctx.priorResolved.length > 0) {
    lines.push(`## Prior incidents on this service and their resolutions (runbook memory)`);
    lines.push(ctx.priorResolved.map((p) => `- (${p.ageDays}d ago) "${p.title}" — Resolution: ${p.resolution}`).join('\n'));
    lines.push('');
  }

  lines.push(`Produce a markdown report with three sections: "## Likely root cause", "## Evidence" (bullet list citing specific log timestamps / health checks / steps from the data above), and "## Suggested next steps" (3–5 concrete actions). Keep the whole report under 300 words.`);

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}

export interface RcaStreamCallbacks {
  onDelta?: (chunk: string, total: string) => void;
  onError?: (err: Error) => void;
}

// Drives the stream and persists incrementally. Returns the final string when done.
export async function streamRcaInto(incidentId: string, cb: RcaStreamCallbacks = {}): Promise<string> {
  const ctx = await assembleContext(incidentId);
  if (!ctx) throw new Error('incident not found');

  await prisma.incidentEvent.create({
    data: { incidentId, type: 'rca_started', payload: JSON.stringify({ model: currentModel() }) },
  });

  const messages = buildPrompt(ctx);
  let total = '';
  try {
    for await (const chunk of streamChat(messages, { temperature: 0.2, maxTokens: 700 })) {
      total += chunk;
      cb.onDelta?.(chunk, total);
    }
  } catch (err) {
    cb.onError?.(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }

  await prisma.incident.update({
    where: { id: incidentId },
    data: { rcaMarkdown: total, rcaModel: currentModel() },
  });
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'rca_completed', payload: JSON.stringify({ chars: total.length }) },
  });
  return total;
}
