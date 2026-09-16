// Server-side scheduler: the single heartbeat that keeps monitoring running
// without anyone having the UI open. One `tick()`:
//   1. runs every probe whose interval has elapsed (claimed atomically so
//      concurrent tickers — in-process loop, `npm run worker`, cron — never
//      double-probe a service)
//   2. keeps the demo mesh's simulated health moving
//   3. fires due chaos drills (demo architectures only)
//   4. drains the job queue
//
// Drivers: instrumentation.ts (in-process loop for `next dev` / `next start`),
// scripts/worker.ts (standalone), and GET /api/cron/tick (Vercel / external cron).

import { prisma } from './prisma';
import { probeService } from './probes';
import { runDueSchedules } from './chaos';
import { drain, enqueue } from './jobs';
import { registerJobHandlers } from './job-handlers';

export const DEMO_SIM_INTERVAL_SEC = 60;

function poolConnectionLimit(): number {
  try {
    const limit = Number(new URL(process.env.DATABASE_URL ?? '').searchParams.get('connection_limit'));
    return Number.isFinite(limit) && limit > 0 ? limit : 10;
  } catch {
    return 10;
  }
}

const PROBE_CONCURRENCY = Math.min(8, poolConnectionLimit());

export function isDue(lastRunAt: Date | null, intervalSec: number, now: number): boolean {
  return !lastRunAt || now - lastRunAt.getTime() >= intervalSec * 1000;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// Claim due probes and return the set of services to probe.
async function claimDueServices(now: Date): Promise<string[]> {
  const probes = await prisma.probe.findMany({
    where: { enabled: true },
    select: { id: true, serviceId: true, intervalSec: true, lastRunAt: true },
  });

  const serviceIds = new Set<string>();
  for (const p of probes) {
    if (serviceIds.has(p.serviceId)) continue;
    if (!isDue(p.lastRunAt, p.intervalSec, now.getTime())) continue;
    // Compare-and-set on lastRunAt: only one ticker wins the claim.
    const claim = await prisma.probe.updateMany({
      where: { id: p.id, lastRunAt: p.lastRunAt },
      data: { lastRunAt: now },
    });
    if (claim.count === 1) serviceIds.add(p.serviceId);
  }
  return Array.from(serviceIds);
}

// Demo services have no probes; advance their simulated health on a fixed cadence.
async function dueDemoServices(now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - DEMO_SIM_INTERVAL_SEC * 1000);
  const rows = await prisma.service.findMany({
    where: {
      architecture: { demo: true },
      probes: { none: { enabled: true } },
      OR: [{ lastHealthCheck: null }, { lastHealthCheck: { lt: cutoff } }],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// Architectures with a contract-test schedule get a `contract_tests` job when
// their last real run is older than the interval (never two queued at once).
async function enqueueDueContractTests(now: Date): Promise<number> {
  const archs = await prisma.architecture.findMany({
    where: { demo: false, contractTestIntervalMin: { gt: 0 } },
    select: {
      id: true,
      contractTestIntervalMin: true,
      regressionRuns: { where: { simulated: false }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  let queued = 0;
  for (const a of archs) {
    const last = a.regressionRuns[0]?.createdAt;
    if (last && now.getTime() - last.getTime() < a.contractTestIntervalMin * 60_000) continue;
    const inFlight = await prisma.job.findFirst({
      where: { type: 'contract_tests', status: { in: ['pending', 'running'] }, payload: { contains: `"architectureId":"${a.id}"` } },
      select: { id: true },
    });
    if (inFlight) continue;
    await enqueue('contract_tests', { architectureId: a.id });
    queued++;
  }
  return queued;
}

export interface TickResult {
  probed: number;
  simulated: number;
  chaos: number;
  jobs: number;
  ms: number;
}

export async function tick(now: Date = new Date()): Promise<TickResult> {
  const start = Date.now();
  registerJobHandlers();

  const real = await claimDueServices(now);
  const demo = await dueDemoServices(now);
  await mapLimit([...real, ...demo], PROBE_CONCURRENCY, (id) =>
    probeService(id).catch((err) => {
      console.error(`[scheduler] probe ${id} failed:`, err);
      return null;
    })
  );

  await enqueueDueContractTests(now).catch((err) => console.error('[scheduler] contract-test scheduling failed:', err));
  const chaos = await runDueSchedules();
  const jobs = await drain({ limit: 25 });

  return { probed: real.length, simulated: demo.length, chaos: chaos.filter((c) => c.ok).length, jobs: jobs.length, ms: Date.now() - start };
}

// In-process loop. Guarded on globalThis so HMR / repeated register() calls
// never start two loops, and a slow tick is never overlapped by the next one.
interface SchedulerGlobal {
  __servicelens_scheduler?: { timer: NodeJS.Timeout; running: boolean };
}

export function startSchedulerLoop(intervalSec: number): void {
  const g = globalThis as unknown as SchedulerGlobal;
  if (g.__servicelens_scheduler) return;
  const state = { timer: undefined as unknown as NodeJS.Timeout, running: false };
  const run = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const r = await tick();
      if (r.probed || r.chaos || r.jobs) {
        console.log(`[scheduler] probed=${r.probed} simulated=${r.simulated} chaos=${r.chaos} jobs=${r.jobs} in ${r.ms}ms`);
      }
    } catch (err) {
      console.error('[scheduler] tick failed:', err);
    } finally {
      state.running = false;
    }
  };
  state.timer = setInterval(run, intervalSec * 1000);
  g.__servicelens_scheduler = state;
  void run();
}
