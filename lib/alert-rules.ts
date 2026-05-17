import { prisma } from './prisma';
import { parseJson } from './utils';
import { openIncident, resolveIncidentForRule } from './incidents';

// ─────────────────────────────────────────────────────────────────────────────
// JSON DSL — keep it boring on purpose. Forms in the UI produce these shapes.
// ─────────────────────────────────────────────────────────────────────────────
export type AlertCondition =
  | { kind: 'status_eq'; status: 'down' | 'degraded' | 'healthy' }
  | { kind: 'p95_latency_gt'; thresholdMs: number }
  | { kind: 'error_rate_gt'; threshold: number /* 0..1 */ }
  | { kind: 'consecutive_down'; count: number }
  | { kind: 'regression_failed'; minFailed: number };

export interface AlertContext {
  serviceId: string;
  // Health window samples — newest last.
  history: Array<{ status: 'healthy' | 'degraded' | 'down'; responseTime: number | null; checkedAt: Date }>;
  // Most recent regression run for this service's architecture (optional).
  latestRun?: { failedSteps: number; totalSteps: number } | null;
}

export function evaluate(condition: AlertCondition, ctx: AlertContext): boolean {
  switch (condition.kind) {
    case 'status_eq': {
      const last = ctx.history[ctx.history.length - 1];
      return !!last && last.status === condition.status;
    }
    case 'p95_latency_gt': {
      const rts = ctx.history.map((h) => h.responseTime).filter((r): r is number => typeof r === 'number');
      if (rts.length === 0) return false;
      const sorted = rts.slice().sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      return sorted[idx] > condition.thresholdMs;
    }
    case 'error_rate_gt': {
      if (ctx.history.length === 0) return false;
      const bad = ctx.history.filter((h) => h.status !== 'healthy').length;
      return bad / ctx.history.length > condition.threshold;
    }
    case 'consecutive_down': {
      const tail = ctx.history.slice(-condition.count);
      return tail.length === condition.count && tail.every((h) => h.status === 'down');
    }
    case 'regression_failed': {
      return !!ctx.latestRun && ctx.latestRun.failedSteps >= condition.minFailed;
    }
  }
}

export function describeCondition(c: AlertCondition): string {
  switch (c.kind) {
    case 'status_eq': return `status is ${c.status}`;
    case 'p95_latency_gt': return `p95 latency > ${c.thresholdMs}ms`;
    case 'error_rate_gt': return `error rate > ${Math.round(c.threshold * 100)}%`;
    case 'consecutive_down': return `${c.count} consecutive down checks`;
    case 'regression_failed': return `regression run failed ≥ ${c.minFailed} steps`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime evaluator: called after each probe write. Walks rules scoped to the
// service (and its architecture) and opens/resolves incidents accordingly.
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateRulesForService(serviceId: string): Promise<void> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, architectureId: true, name: true },
  });
  if (!service) return;

  const rules = await prisma.alertRule.findMany({
    where: {
      architectureId: service.architectureId,
      enabled: true,
      OR: [{ serviceId: null }, { serviceId: service.id }],
    },
  });
  if (rules.length === 0) return;

  // Pull a single window large enough to cover the longest rule.
  const maxWindow = rules.reduce((m, r) => Math.max(m, r.windowSec), 300);
  const since = new Date(Date.now() - maxWindow * 1000);
  const history = await prisma.healthRecord.findMany({
    where: { serviceId: service.id, checkedAt: { gte: since } },
    orderBy: { checkedAt: 'asc' },
    select: { status: true, responseTime: true, checkedAt: true },
  });

  const latestRun = await prisma.regressionRun.findFirst({
    where: { architectureId: service.architectureId },
    orderBy: { createdAt: 'desc' },
    select: { failedSteps: true, totalSteps: true },
  });

  const ctx: AlertContext = {
    serviceId: service.id,
    history: history.map((h) => ({
      status: h.status as 'healthy' | 'degraded' | 'down',
      responseTime: h.responseTime,
      checkedAt: h.checkedAt,
    })),
    latestRun,
  };

  for (const rule of rules) {
    const condition = parseJson<AlertCondition | null>(rule.condition, null);
    if (!condition) continue;

    // forDurationSec: only fire if the condition has been true continuously
    // for that long. Approximate by checking the trailing slice.
    const windowed: AlertContext = {
      ...ctx,
      history: ctx.history.filter((h) => h.checkedAt.getTime() >= Date.now() - rule.windowSec * 1000),
    };

    const isFiring = evaluate(condition, windowed);

    if (isFiring) {
      // Need at least 1 check in the for-duration trailing slice that confirms.
      const forSlice = windowed.history.filter((h) => h.checkedAt.getTime() >= Date.now() - rule.forDurationSec * 1000);
      if (forSlice.length === 0) continue;
      const persisted = evaluate(condition, { ...windowed, history: forSlice });
      if (!persisted) continue;

      await openIncident({
        architectureId: service.architectureId,
        ruleId: rule.id,
        serviceId: service.id,
        title: `${rule.name} — ${service.name}`,
        severity: rule.severity as 'info' | 'warning' | 'critical',
        summary: describeCondition(condition),
        source: 'rule',
        simulated: false,
      });
    } else {
      // Clear gates: condition off across 2× the window.
      const clearSliceSince = Date.now() - rule.windowSec * 2 * 1000;
      const clearSlice = ctx.history.filter((h) => h.checkedAt.getTime() >= clearSliceSince);
      const stillFiring = clearSlice.length > 0 && evaluate(condition, { ...ctx, history: clearSlice });
      if (!stillFiring) {
        await resolveIncidentForRule(rule.id, service.id, 'auto');
      }
    }
  }
}
