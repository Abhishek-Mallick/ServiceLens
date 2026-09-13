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

    const decision = decide(condition, rule, ctx);
    if (decision === 'fire') {
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
    } else if (decision === 'clear') {
      await resolveIncidentForRule(rule.id, service.id, 'auto');
    }
  }
}

export interface RuleTiming {
  windowSec: number;
  forDurationSec: number;
}

// Pure decision for one rule against a health history (oldest first).
// Prometheus-style `for`: the condition is evaluated over `windowSec` ending at
// each sample; it must have been true at every sample for at least
// `forDurationSec` before the rule fires.
//   fire  — continuously true for ≥ forDurationSec (or true now when forDurationSec = 0)
//   clear — false now and false across 2× the window (safe to auto-resolve)
//   hold  — anything in between; leave any open incident alone
export function decide(
  condition: AlertCondition,
  rule: RuleTiming,
  ctx: AlertContext,
  now: number = Date.now()
): 'fire' | 'clear' | 'hold' {
  const at = (t: number, windowSec: number) =>
    evaluate(condition, {
      ...ctx,
      history: ctx.history.filter((h) => {
        const ts = h.checkedAt.getTime();
        return ts <= t && ts > t - windowSec * 1000;
      }),
    });

  if (at(now, rule.windowSec)) {
    if (rule.forDurationSec <= 0) return 'fire';
    // Walk back through samples while the condition stays true.
    let firstTrue = now;
    for (let i = ctx.history.length - 1; i >= 0; i--) {
      const t = ctx.history[i].checkedAt.getTime();
      if (t > now) continue;
      if (!at(t, rule.windowSec)) break;
      firstTrue = t;
    }
    return now - firstTrue >= rule.forDurationSec * 1000 ? 'fire' : 'hold';
  }

  return at(now, rule.windowSec * 2) ? 'hold' : 'clear';
}
