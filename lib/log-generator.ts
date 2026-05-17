import { ingestForService, type IngestEntry } from './logs';
import { prisma } from './prisma';

// Stable per-name RNG so generated logs feel consistent.
function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INFO_TEMPLATES = (svc: string) => [
  `${svc} accepted request`,
  `${svc} processed message`,
  `${svc} cache hit`,
  `${svc} db query completed`,
  `${svc} produced kafka event`,
];
const WARN_TEMPLATES = (svc: string) => [
  `${svc} retry attempt 2/3 for upstream call`,
  `${svc} response time approaching SLO budget`,
  `${svc} kafka consumer lag growing`,
];
const ERROR_TEMPLATES = (svc: string) => [
  `${svc} upstream returned 503`,
  `${svc} timeout reached after 5000ms`,
  `${svc} payload schema validation failed`,
  `${svc} kafka consumer group rebalance failed`,
  `${svc} database connection refused`,
];

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

// Generate `count` entries spanning [now - windowSec, now], with error rate
// scaled by health status. Returns the entries (not persisted).
export function generateEntries(serviceName: string, status: 'healthy' | 'degraded' | 'down' | 'unknown', windowSec: number, count: number, seedOffset = 0): IngestEntry[] {
  const rng = mulberry(hash32(serviceName) + seedOffset);
  const entries: IngestEntry[] = [];
  const now = Date.now();
  const errorRate = status === 'down' ? 0.55 : status === 'degraded' ? 0.18 : 0.02;
  const warnRate = status === 'down' ? 0.2 : status === 'degraded' ? 0.25 : 0.05;
  for (let i = 0; i < count; i++) {
    const r = rng();
    const at = new Date(now - Math.floor((1 - i / count) * windowSec * 1000));
    let level: 'info' | 'warn' | 'error' = 'info';
    let message: string;
    if (r < errorRate) { level = 'error'; message = pick(ERROR_TEMPLATES(serviceName), rng()); }
    else if (r < errorRate + warnRate) { level = 'warn'; message = pick(WARN_TEMPLATES(serviceName), rng()); }
    else { level = 'info'; message = pick(INFO_TEMPLATES(serviceName), rng()); }
    const traceId = `t_${Math.floor(rng() * 1e9).toString(36)}`;
    entries.push({
      level,
      message,
      traceId,
      spanId: `s_${Math.floor(rng() * 1e9).toString(36)}`,
      fields: { simulated: true, requestId: traceId },
      at,
    });
  }
  return entries;
}

export async function generateForArchitecture(architectureId: string, windowSec = 3600, perService = 80) {
  const services = await prisma.service.findMany({
    where: { architectureId },
    select: { id: true, name: true, healthStatus: true },
  });
  for (const s of services) {
    const entries = generateEntries(s.name, (s.healthStatus as 'healthy' | 'degraded' | 'down' | 'unknown') ?? 'healthy', windowSec, perService);
    await ingestForService(s.id, entries, { simulated: true });
  }
  return { services: services.length, total: services.length * perService };
}
