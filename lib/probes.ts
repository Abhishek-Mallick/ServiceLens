import net from 'node:net';
import { prisma } from './prisma';
import { parseJson, stringify } from './utils';
import { simulateHealth, recordHealth, type HealthCheckResult } from './health-monitor';
import { evaluateRulesForService } from './alert-rules';
import { assertAllowedHost, guardedLookup, guardedRequest } from './net-guard';
import { decryptSecret } from './secrets';
import { probePostgres, probeRedis } from './datastore-probes';

export interface ProbeConfig {
  id: string;
  serviceId: string;
  name: string;
  type: 'http' | 'tcp' | 'ping' | 'cmd' | 'heartbeat' | 'postgres' | 'redis';
  target: string;
  intervalSec: number;
  timeoutSec: number;
  expectStatus: number | null;
  expectBodyRegex: string | null;
  headers: Record<string, string> | null;
  secret?: string | null; // encrypted connection string (postgres/redis)
}

export interface ProbeRunResult {
  probeId: string;
  ok: boolean;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number | null;
  details: Record<string, unknown>;
}

export async function runProbe(p: ProbeConfig): Promise<ProbeRunResult> {
  const start = Date.now();
  try {
    if (p.type === 'http') {
      return await runHttpProbe(p, start);
    }
    if (p.type === 'tcp' || p.type === 'ping') {
      return await runTcpProbe(p, start);
    }
    if (p.type === 'postgres' || p.type === 'redis') {
      return await runDatastoreProbe(p);
    }
    return {
      probeId: p.id,
      ok: false,
      status: 'down',
      responseTime: null,
      details: { error: `unsupported probe type: ${p.type}` },
    };
  } catch (err) {
    return {
      probeId: p.id,
      ok: false,
      status: 'down',
      responseTime: Date.now() - start,
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function runHttpProbe(p: ProbeConfig, start: number): Promise<ProbeRunResult> {
  const res = await guardedRequest(p.target, {
    headers: p.headers ?? undefined,
    timeoutMs: p.timeoutSec * 1000,
  });
  const responseTime = Date.now() - start;
  const statusOk = p.expectStatus != null ? res.status === p.expectStatus : res.status >= 200 && res.status < 300;

  let bodyOk = true;
  if (p.expectBodyRegex) {
    try {
      bodyOk = new RegExp(p.expectBodyRegex).test(res.body);
    } catch {
      bodyOk = false;
    }
  }

  const ok = statusOk && bodyOk;
  const status: ProbeRunResult['status'] = ok
    ? responseTime > p.timeoutSec * 800
      ? 'degraded'
      : 'healthy'
    : res.status >= 500
      ? 'down'
      : 'degraded';

  return {
    probeId: p.id,
    ok,
    status,
    responseTime,
    details: { statusCode: res.status, statusOk, bodyOk },
  };
}

function runTcpProbe(p: ProbeConfig, start: number): Promise<ProbeRunResult> {
  return new Promise((resolve) => {
    const idx = p.target.lastIndexOf(':');
    const host = idx > 0 ? p.target.slice(0, idx).replace(/^\[|\]$/g, '') : p.target;
    const port = Number(idx > 0 ? p.target.slice(idx + 1) : 80);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
      resolve({
        probeId: p.id,
        ok: false,
        status: 'down',
        responseTime: null,
        details: { error: `invalid tcp target "${p.target}" — expected host:port` },
      });
      return;
    }
    try {
      assertAllowedHost(host);
    } catch (err) {
      resolve({ probeId: p.id, ok: false, status: 'down', responseTime: null, details: { error: (err as Error).message, host, port } });
      return;
    }
    const socket = new net.Socket();
    let settled = false;
    const finish = (r: ProbeRunResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(p.timeoutSec * 1000);
    socket.once('connect', () => {
      finish({ probeId: p.id, ok: true, status: 'healthy', responseTime: Date.now() - start, details: { host, port } });
    });
    socket.once('timeout', () => {
      finish({ probeId: p.id, ok: false, status: 'down', responseTime: Date.now() - start, details: { error: 'timeout', host, port } });
    });
    socket.once('error', (err) => {
      finish({ probeId: p.id, ok: false, status: 'down', responseTime: Date.now() - start, details: { error: err.message, host, port } });
    });
    socket.connect({ port, host, lookup: guardedLookup as unknown as net.LookupFunction });
  });
}

async function runDatastoreProbe(p: ProbeConfig): Promise<ProbeRunResult> {
  const url = decryptSecret(p.secret ?? null);
  if (!url) {
    return { probeId: p.id, ok: false, status: 'down', responseTime: null, details: { error: 'no stored credentials — edit the probe and re-enter the connection string' } };
  }
  const timeoutMs = p.timeoutSec * 1000;
  const r = p.type === 'postgres' ? await probePostgres(url, timeoutMs) : await probeRedis(url, timeoutMs);
  const status: ProbeRunResult['status'] = !r.ok ? 'down' : (r.latencyMs ?? 0) > timeoutMs * 0.8 ? 'degraded' : 'healthy';
  return { probeId: p.id, ok: r.ok, status, responseTime: r.latencyMs, details: { ...(r.details ?? {}), ...(r.error ? { error: r.error } : {}) } };
}

type DbProbe = Awaited<ReturnType<typeof prisma.probe.findMany>>[number];

// Probe as returned to clients: never includes credentials or header values.
export function publicProbe(p: DbProbe) {
  const { secret: _secret, headers, ...rest } = p;
  return { ...rest, hasCredentials: !!_secret, headers: headers ? '[encrypted]' : null };
}

export function toConfig(p: DbProbe): ProbeConfig {
  return {
    id: p.id,
    serviceId: p.serviceId,
    name: p.name,
    type: p.type as ProbeConfig['type'],
    target: p.target,
    intervalSec: p.intervalSec,
    timeoutSec: p.timeoutSec,
    expectStatus: p.expectStatus,
    expectBodyRegex: p.expectBodyRegex,
    headers: parseJson<Record<string, string> | null>(decryptSecret(p.headers), null),
    secret: p.secret ?? null,
  };
}

// Aggregate multiple probe results into one HealthCheckResult per service.
// Rule: worst status wins; response time = max.
function aggregate(results: ProbeRunResult[]): HealthCheckResult {
  if (results.length === 0) {
    return { status: 'healthy', responseTime: null, details: { probeCount: 0 }, simulated: false };
  }
  let status: HealthCheckResult['status'] = 'healthy';
  let rt = 0;
  for (const r of results) {
    if (r.status === 'down') status = 'down';
    else if (r.status === 'degraded' && status !== 'down') status = 'degraded';
    if (r.responseTime != null && r.responseTime > rt) rt = r.responseTime;
  }
  return {
    status,
    responseTime: rt || null,
    details: {
      probeCount: results.length,
      results: results.map((r) => ({ probeId: r.probeId, status: r.status, rt: r.responseTime })),
    },
    simulated: false,
  };
}

// Probe a single service by running all its enabled probes. Services with no
// probes only get simulated health on demo architectures; on real
// architectures they record nothing (status stays "unknown") — never fake data.
export interface HeartbeatState {
  at: Date | null;
  status: string | null;
  message: string | null;
}

// Push-mode health: the service calls POST /api/v1/services/:name/heartbeat.
// Missing two consecutive intervals means down.
export function evaluateHeartbeat(p: Pick<ProbeConfig, 'id' | 'intervalSec'>, hb: HeartbeatState, now: number = Date.now()): ProbeRunResult {
  if (!hb.at) {
    return { probeId: p.id, ok: false, status: 'down', responseTime: null, details: { heartbeat: true, error: 'no heartbeat received yet' } };
  }
  const ageSec = Math.round((now - hb.at.getTime()) / 1000);
  if (ageSec > p.intervalSec * 2) {
    return { probeId: p.id, ok: false, status: 'down', responseTime: null, details: { heartbeat: true, ageSec, error: `no heartbeat for ${ageSec}s (expected every ${p.intervalSec}s)` } };
  }
  const status: ProbeRunResult['status'] = hb.status === 'down' ? 'down' : hb.status === 'degraded' ? 'degraded' : 'healthy';
  return { probeId: p.id, ok: status === 'healthy', status, responseTime: null, details: { heartbeat: true, ageSec, message: hb.message } };
}

export async function probeService(serviceId: string): Promise<HealthCheckResult | null> {
  const probes = await prisma.probe.findMany({ where: { serviceId, enabled: true } });
  let result: HealthCheckResult;
  if (probes.length === 0) {
    const svc = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, name: true, healthEndpoint: true, architecture: { select: { demo: true } } },
    });
    if (!svc?.architecture.demo) return null;
    result = simulateHealth(svc);
  } else {
    const hb = probes.some((p) => p.type === 'heartbeat')
      ? await prisma.service.findUnique({ where: { id: serviceId }, select: { heartbeatAt: true, heartbeatStatus: true, heartbeatMessage: true } })
      : null;
    const runs = await Promise.all(
      probes.map((p) =>
        p.type === 'heartbeat'
          ? Promise.resolve(evaluateHeartbeat(toConfig(p), { at: hb?.heartbeatAt ?? null, status: hb?.heartbeatStatus ?? null, message: hb?.heartbeatMessage ?? null }))
          : runProbe(toConfig(p))
      )
    );
    await prisma.probe.updateMany({
      where: { id: { in: probes.map((p) => p.id) } },
      data: { lastRunAt: new Date() },
    });
    result = aggregate(runs);
  }
  await recordHealth(serviceId, result);
  // After health is recorded, give rules a chance to fire.
  await evaluateRulesForService(serviceId).catch((err) => {
    console.error('[probes] rule evaluation failed:', err);
  });
  return result;
}

export async function probeArchitecture(architectureId: string) {
  const services = await prisma.service.findMany({ where: { architectureId }, select: { id: true, name: true } });
  return Promise.all(
    services.map(async (s) => ({ serviceId: s.id, name: s.name, result: await probeService(s.id) }))
  );
}

// Job handler binding — registered from lib/job-handlers.ts (called from app bootstrap).
export interface ProbeJobPayload {
  scope: 'service' | 'architecture';
  id: string;
}

export async function handleProbeJob(payload: ProbeJobPayload) {
  if (payload.scope === 'service') {
    const r = await probeService(payload.id);
    return { ok: true, status: r?.status ?? 'unknown' };
  }
  const results = await probeArchitecture(payload.id);
  return { ok: true, count: results.length };
}

// Used by API + UI to render config nicely.
export function describeProbe(p: ProbeConfig): string {
  if (p.type === 'http') return `HTTP ${p.target}${p.expectStatus ? ` → ${p.expectStatus}` : ''}`;
  if (p.type === 'heartbeat') return `Heartbeat (push) every ${p.intervalSec}s`;
  if (p.type === 'postgres' || p.type === 'redis') return `${p.type === 'postgres' ? 'Postgres' : 'Redis'} ${p.target}`;
  if (p.type === 'tcp' || p.type === 'ping') return `TCP ${p.target}`;
  return `${p.type} ${p.target}`;
}

export { stringify };
