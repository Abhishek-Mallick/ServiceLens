import crypto from 'node:crypto';
import { prisma } from './prisma';
import { parseJson, stringify } from './utils';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface IngestEntry {
  level?: LogLevel;
  message: string;
  fields?: Record<string, unknown> | null;
  traceId?: string | null;
  spanId?: string | null;
  at?: string | Date;
}

export interface SearchFilters {
  architectureId: string;
  serviceIds?: string[];
  levels?: LogLevel[];
  query?: string | null;
  since?: Date | null;
  until?: Date | null;
  limit?: number;
}

export async function ingestForService(serviceId: string, entries: IngestEntry[], opts: { simulated?: boolean } = {}) {
  if (entries.length === 0) return { count: 0 };
  const rows = entries.slice(0, 1000).map((e) => ({
    serviceId,
    level: (e.level ?? 'info') as LogLevel,
    message: String(e.message ?? '').slice(0, 4000),
    fields: e.fields ? stringify(e.fields) : null,
    traceId: e.traceId ?? null,
    spanId: e.spanId ?? null,
    simulated: !!opts.simulated,
    at: e.at ? new Date(e.at) : new Date(),
  }));
  const res = await prisma.logEntry.createMany({ data: rows });
  return { count: res.count };
}

export async function search(filters: SearchFilters) {
  const where: Record<string, unknown> = {
    service: { architectureId: filters.architectureId },
  };
  if (filters.serviceIds && filters.serviceIds.length > 0) {
    where.serviceId = { in: filters.serviceIds };
  }
  if (filters.levels && filters.levels.length > 0) {
    where.level = { in: filters.levels };
  }
  if (filters.since || filters.until) {
    where.at = {
      ...(filters.since ? { gte: filters.since } : {}),
      ...(filters.until ? { lte: filters.until } : {}),
    };
  }
  if (filters.query && filters.query.trim()) {
    where.message = { contains: filters.query.trim(), mode: 'insensitive' };
  }
  return prisma.logEntry.findMany({
    where: where as never,
    orderBy: { at: 'desc' },
    take: Math.min(filters.limit ?? 200, 1000),
    include: { service: { select: { id: true, name: true } } },
  });
}

// Snapshot last `windowSec` of logs for a service + its 1-hop neighbors.
// Returns a serializable structure suitable for stashing into IncidentEvent.payload.
export async function snapshotForIncident(serviceId: string | null, windowSec = 300) {
  if (!serviceId) return { logs: [], note: 'no service attached to incident' };
  const since = new Date(Date.now() - windowSec * 1000);

  const deps = await prisma.serviceDependency.findMany({
    where: { OR: [{ dependentId: serviceId }, { dependencyId: serviceId }] },
    select: { dependentId: true, dependencyId: true },
  });
  const neighborIds = new Set<string>([serviceId]);
  for (const d of deps) {
    neighborIds.add(d.dependentId);
    neighborIds.add(d.dependencyId);
  }

  const rows = await prisma.logEntry.findMany({
    where: {
      serviceId: { in: Array.from(neighborIds) },
      at: { gte: since },
      level: { in: ['warn', 'error'] }, // bias toward signal
    },
    orderBy: { at: 'desc' },
    take: 80,
    include: { service: { select: { id: true, name: true } } },
  });
  return {
    windowSec,
    services: Array.from(neighborIds),
    logs: rows.map((r) => ({
      id: r.id,
      service: r.service.name,
      level: r.level,
      message: r.message,
      fields: r.fields ? parseJson<Record<string, unknown>>(r.fields, {}) : null,
      at: r.at.toISOString(),
    })),
  };
}

export function generateIngestToken(): string {
  return 'sl_' + crypto.randomBytes(24).toString('base64url');
}

export async function ensureIngestToken(serviceId: string): Promise<string> {
  const svc = await prisma.service.findUnique({ where: { id: serviceId }, select: { ingestToken: true } });
  if (svc?.ingestToken) return svc.ingestToken;
  const token = generateIngestToken();
  await prisma.service.update({ where: { id: serviceId }, data: { ingestToken: token } });
  return token;
}

export async function findServiceByIngestToken(token: string) {
  return prisma.service.findUnique({ where: { ingestToken: token }, select: { id: true, architectureId: true } });
}
