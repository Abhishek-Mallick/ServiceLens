import net from 'node:net';
import { prisma } from './prisma';
import { parseJson, stringify } from './utils';
import { simulateHealth, recordHealth, type HealthCheckResult } from './health-monitor';
import { evaluateRulesForService } from './alert-rules';

export interface ProbeConfig {
  id: string;
  serviceId: string;
  name: string;
  type: 'http' | 'tcp' | 'ping' | 'cmd';
  target: string;
  intervalSec: number;
  timeoutSec: number;
  expectStatus: number | null;
  expectBodyRegex: string | null;
  headers: Record<string, string> | null;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), p.timeoutSec * 1000);
  try {
    const res = await fetch(p.target, {
      signal: controller.signal,
      headers: p.headers ?? undefined,
    });
    const responseTime = Date.now() - start;
    const expected = p.expectStatus;
    const statusOk = expected != null ? res.status === expected : res.ok;

    let bodyOk = true;
    if (p.expectBodyRegex) {
      const text = await res.text();
      try {
        bodyOk = new RegExp(p.expectBodyRegex).test(text);
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
  } finally {
    clearTimeout(timer);
  }
}

function runTcpProbe(p: ProbeConfig, start: number): Promise<ProbeRunResult> {
  return new Promise((resolve) => {
    const [host, portRaw] = p.target.split(':');
    const port = Number(portRaw || 80);
    if (!host || !Number.isFinite(port)) {
      resolve({
        probeId: p.id,
        ok: false,
        status: 'down',
        responseTime: null,
        details: { error: `invalid tcp target "${p.target}" — expected host:port` },
      });
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
    socket.connect(port, host);
  });
}

type DbProbe = Awaited<ReturnType<typeof prisma.probe.findMany>>[number];

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
    headers: parseJson<Record<string, string> | null>(p.headers, null),
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

// Probe a single service: run all enabled probes (real); if none, fall back to simulate.
export async function probeService(serviceId: string): Promise<HealthCheckResult> {
  const probes = await prisma.probe.findMany({ where: { serviceId, enabled: true } });
  let result: HealthCheckResult;
  if (probes.length === 0) {
    const svc = await prisma.service.findUnique({ where: { id: serviceId }, select: { id: true, name: true, healthEndpoint: true } });
    result = svc ? simulateHealth(svc) : { status: 'down', responseTime: null, details: { error: 'service not found' }, simulated: true };
  } else {
    const runs = await Promise.all(probes.map((p) => runProbe(toConfig(p))));
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
    return { ok: true, status: r.status };
  }
  const results = await probeArchitecture(payload.id);
  return { ok: true, count: results.length };
}

// Used by API + UI to render config nicely.
export function describeProbe(p: ProbeConfig): string {
  if (p.type === 'http') return `HTTP ${p.target}${p.expectStatus ? ` → ${p.expectStatus}` : ''}`;
  if (p.type === 'tcp' || p.type === 'ping') return `TCP ${p.target}`;
  return `${p.type} ${p.target}`;
}

export { stringify };
