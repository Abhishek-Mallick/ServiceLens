// Contract tests: real regression runs for real architectures.
//
// Every GET route ServiceLens extracted from a service's repo is called on
// the service's deployed URL. This catches deploy drift (a route in the code
// isn't served) and server errors, with no test code to write.
//
//   pass: 2xx/3xx, or 401/403/429 (the route exists, it's just protected or throttled)
//   fail: 404/405 (route missing on the deployment), 5xx, timeouts, network errors
//
// Only safe methods, and only paths without parameters (no guessing ids).
// Results are RegressionRun/RegressionTestStep rows with simulated=false, so
// the existing `regression_failed` alert rule and run pages work unchanged.

import { prisma } from './prisma';
import { parseJson, stringify } from './utils';
import { guardedRequest } from './net-guard';
import { joinHealthUrl } from './monitoring/defaults';
import { evaluateRulesForService } from './alert-rules';
import type { Endpoint } from './ingest/types';

const MAX_CHECKS_PER_SERVICE = 25;
const CONCURRENCY = 4;
const TIMEOUT_MS = 10_000;

export interface PlannedCheck {
  serviceId: string;
  serviceName: string;
  method: 'GET';
  path: string;
  url: string;
  source: string;
}

export interface SkippedCheck {
  serviceId: string;
  serviceName: string;
  method: string;
  path: string;
  reason: string;
}

export function planContractChecks(
  services: Array<{ id: string; name: string; deployedUrl: string | null; endpoints: Endpoint[] }>
): { checks: PlannedCheck[]; skipped: SkippedCheck[] } {
  const checks: PlannedCheck[] = [];
  const skipped: SkippedCheck[] = [];
  for (const s of services) {
    if (!s.deployedUrl) {
      if (s.endpoints.length) skipped.push({ serviceId: s.id, serviceName: s.name, method: '*', path: '*', reason: 'no deployed URL' });
      continue;
    }
    const seen = new Set<string>();
    let count = 0;
    for (const e of s.endpoints) {
      const method = e.method.toUpperCase();
      if (!['GET', 'HEAD', 'ANY', 'ALL'].includes(method)) {
        skipped.push({ serviceId: s.id, serviceName: s.name, method, path: e.path, reason: 'not a safe method (only GET routes are called)' });
        continue;
      }
      if (/[:*[\]{}()]/.test(e.path)) {
        skipped.push({ serviceId: s.id, serviceName: s.name, method, path: e.path, reason: 'has path parameters' });
        continue;
      }
      if (seen.has(e.path)) continue;
      seen.add(e.path);
      if (count >= MAX_CHECKS_PER_SERVICE) {
        skipped.push({ serviceId: s.id, serviceName: s.name, method, path: e.path, reason: `limit of ${MAX_CHECKS_PER_SERVICE} routes per service` });
        continue;
      }
      count++;
      checks.push({ serviceId: s.id, serviceName: s.name, method: 'GET', path: e.path, url: joinHealthUrl(s.deployedUrl, e.path), source: `${e.file}:${e.line}` });
    }
  }
  return { checks, skipped };
}

export function judgeStatus(status: number): { pass: boolean; note: string } {
  if (status >= 200 && status < 400) return { pass: true, note: `HTTP ${status}` };
  if (status === 401 || status === 403) return { pass: true, note: `HTTP ${status} (route exists, requires auth)` };
  if (status === 429) return { pass: true, note: 'HTTP 429 (route exists, rate limited)' };
  if (status === 404 || status === 405) {
    return { pass: false, note: `HTTP ${status}: this route is in the repo but the deployment doesn't serve it (deploy drift or wrong base URL?)` };
  }
  if (status >= 500) return { pass: false, note: `HTTP ${status}: server error` };
  return { pass: false, note: `HTTP ${status}: unexpected response` };
}

export async function loadContractPlan(architectureId: string) {
  const services = await prisma.service.findMany({
    where: { architectureId },
    select: { id: true, name: true, deployedUrl: true, contract: { select: { endpoints: true } } },
    orderBy: { name: 'asc' },
  });
  return planContractChecks(
    services.map((s) => ({ id: s.id, name: s.name, deployedUrl: s.deployedUrl, endpoints: parseJson<Endpoint[]>(s.contract?.endpoints, []) }))
  );
}

export interface ContractRunResult {
  runId: string;
  status: 'completed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  failures: Array<{ service: string; path: string; status: number | null; error: string }>;
}

export async function runContractTests(architectureId: string, opts: { triggeredBy?: string } = {}): Promise<ContractRunResult> {
  const arch = await prisma.architecture.findUnique({ where: { id: architectureId }, select: { demo: true } });
  if (!arch) throw new Error('architecture not found');
  if (arch.demo) throw new Error('Contract tests run against real architectures; the demo uses simulated regression runs.');

  const plan = await loadContractPlan(architectureId);
  const run = await prisma.regressionRun.create({
    data: {
      architectureId,
      status: 'running',
      triggeredBy: opts.triggeredBy ?? 'manual',
      startedAt: new Date(),
      totalSteps: plan.checks.length,
      simulated: false,
    },
  });

  const outcomes: Array<{ check: PlannedCheck; pass: boolean; status: number | null; note: string }> = new Array(plan.checks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, plan.checks.length) }, async () => {
      while (next < plan.checks.length) {
        const i = next++;
        const check = plan.checks[i];
        const began = Date.now();
        let status: number | null = null;
        let verdict: { pass: boolean; note: string };
        try {
          const res = await guardedRequest(check.url, { timeoutMs: TIMEOUT_MS, maxBodyBytes: 2048, maxRedirects: 3, headers: { accept: 'application/json, text/html;q=0.9, */*;q=0.8' } });
          status = res.status;
          verdict = judgeStatus(res.status);
        } catch (err) {
          verdict = { pass: false, note: err instanceof Error ? err.message : String(err) };
        }
        const duration = Date.now() - began;
        outcomes[i] = { check, pass: verdict.pass, status, note: verdict.note };
        await prisma.regressionTestStep.create({
          data: {
            runId: run.id,
            serviceId: check.serviceId,
            stepOrder: i,
            name: `GET ${check.path}`,
            description: `${check.serviceName} · defined at ${check.source}`,
            type: 'api_call',
            status: verdict.pass ? 'passed' : 'failed',
            input: stringify({ url: check.url }),
            expectedOutput: stringify({ status: '2xx/3xx, or 401/403 for protected routes' }),
            actualOutput: stringify({ status, ms: duration, note: verdict.note }),
            errorMessage: verdict.pass ? null : verdict.note,
            duration,
            executedAt: new Date(),
          },
        });
      }
    })
  );

  const passed = outcomes.filter((o) => o.pass).length;
  const failures = outcomes.filter((o) => !o.pass);
  const recommendations: string[] = [];
  if (failures.some((f) => f.status === 404 || f.status === 405)) {
    recommendations.push('Routes returning 404/405 exist in the repo but not on the deployment. Redeploy, or check the deployed URL and base path.');
  }
  if (failures.some((f) => f.status !== null && f.status >= 500)) {
    recommendations.push(`Investigate server errors on: ${Array.from(new Set(failures.filter((f) => (f.status ?? 0) >= 500).map((f) => f.check.serviceName))).join(', ')}.`);
  }
  if (failures.some((f) => f.status === null)) {
    recommendations.push('Some routes timed out or were unreachable. Check the service is up and reachable from the internet.');
  }
  const summary =
    plan.checks.length === 0
      ? 'Nothing to test yet: no deployed services with GET routes that need no parameters.'
      : `${passed} of ${plan.checks.length} routes responded as expected${failures.length ? `; ${failures.length} failed` : ''}.`;

  const status: 'completed' | 'failed' = failures.length ? 'failed' : 'completed';
  await prisma.regressionRun.update({
    where: { id: run.id },
    data: { status, passedSteps: passed, failedSteps: failures.length, completedAt: new Date(), summary: stringify({ summary, recommendations }) },
  });

  // Let `regression_failed` rules react to the new run.
  for (const serviceId of Array.from(new Set(failures.map((f) => f.check.serviceId)))) {
    await evaluateRulesForService(serviceId).catch((err) => console.error('[contract-tests] rule evaluation failed:', err));
  }

  return {
    runId: run.id,
    status,
    total: plan.checks.length,
    passed,
    failed: failures.length,
    failures: failures.map((f) => ({ service: f.check.serviceName, path: f.check.path, status: f.status, error: f.note })),
  };
}
