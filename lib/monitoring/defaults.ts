// Out-of-the-box monitoring for real architectures: every service with a
// deployedUrl gets an HTTP probe, and every architecture gets a baseline set of
// alert rules. Both are idempotent so they can run on every create/update.

import { prisma } from '@/lib/prisma';
import { stringify } from '@/lib/utils';
import type { AlertCondition } from '@/lib/alert-rules';

export const DEFAULT_PROBE_INTERVAL_SEC = 60;
export const DEFAULT_PROBE_NAME = 'Default health check';

export interface DefaultRule {
  key: string;
  name: string;
  description: string;
  condition: AlertCondition;
  windowSec: number;
  forDurationSec: number;
  severity: 'info' | 'warning' | 'critical';
}

// Timings are tuned for the 60s default probe cadence (see tests/default-rules.test.ts).
export const DEFAULT_RULES: DefaultRule[] = [
  {
    key: 'default:down',
    name: 'Service down',
    description: '3 consecutive failed health checks.',
    condition: { kind: 'consecutive_down', count: 3 },
    windowSec: 600,
    forDurationSec: 0, // the count already is the duration
    severity: 'critical',
  },
  {
    // A short window makes p95 track the latest 1–2 checks, and `for` requires
    // it to stay slow for 3 minutes — so one slow check never pages anyone.
    key: 'default:latency',
    name: 'High latency',
    description: 'Health checks slower than 2s for 3 minutes.',
    condition: { kind: 'p95_latency_gt', thresholdMs: 2000 },
    windowSec: 90,
    forDurationSec: 180,
    severity: 'warning',
  },
  {
    key: 'default:error-rate',
    name: 'Elevated error rate',
    description: 'More than 20% of health checks failing over 5 minutes.',
    condition: { kind: 'error_rate_gt', threshold: 0.2 },
    windowSec: 300,
    forDurationSec: 120,
    severity: 'critical',
  },
];

const DEFAULT_CHANNELS = ['inapp', 'email', 'slack'];

export function joinHealthUrl(deployedUrl: string, healthPath: string): string {
  const base = deployedUrl.replace(/\/+$/, '');
  const path = healthPath.startsWith('/') ? healthPath : `/${healthPath}`;
  return `${base}${path}`;
}

// Create or retarget the default probe so it always follows deployedUrl + healthPath.
// Removes it when the service no longer has a deployedUrl. User-created probes are untouched.
export async function ensureDefaultProbe(serviceId: string): Promise<void> {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, deployedUrl: true, healthPath: true },
  });
  if (!svc) return;

  const existing = await prisma.probe.findFirst({ where: { serviceId, name: DEFAULT_PROBE_NAME } });

  if (!svc.deployedUrl) {
    if (existing) await prisma.probe.delete({ where: { id: existing.id } });
    return;
  }

  const target = joinHealthUrl(svc.deployedUrl, svc.healthPath);
  if (existing) {
    if (existing.target !== target) {
      await prisma.probe.update({ where: { id: existing.id }, data: { target, lastRunAt: null } });
    }
    return;
  }
  await prisma.probe.create({
    data: {
      serviceId,
      name: DEFAULT_PROBE_NAME,
      type: 'http',
      target,
      intervalSec: DEFAULT_PROBE_INTERVAL_SEC,
      timeoutSec: 10,
      expectStatus: null, // any 2xx
      enabled: true,
    },
  });
}

// Seed the baseline rules only while the architecture has no rules at all, so a
// user who edits or deletes them doesn't get them re-created on the next call.
export async function ensureDefaultRules(architectureId: string): Promise<void> {
  const arch = await prisma.architecture.findUnique({
    where: { id: architectureId },
    select: { id: true, demo: true, _count: { select: { alertRules: true } } },
  });
  if (!arch || arch.demo) return;
  if (arch._count.alertRules > 0) return;

  await prisma.alertRule.createMany({
    data: DEFAULT_RULES.map((r) => ({
      architectureId,
      name: r.name,
      description: r.description,
      condition: stringify(r.condition),
      windowSec: r.windowSec,
      forDurationSec: r.forDurationSec,
      severity: r.severity,
      channels: stringify(DEFAULT_CHANNELS),
      enabled: true,
    })),
  });
}
