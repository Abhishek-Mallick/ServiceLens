// Generic async job queue, backed by the Prisma `Job` table.
//
// Phase 0 ships a thin in-process worker: API routes call `enqueue()`, and a
// single tick loop drains pending jobs. Later phases can swap the
// implementation behind this module (Inngest / BullMQ + Redis) without
// changing call sites — the `Job` row contract stays stable.

import { prisma } from './prisma';
import { parseJson, stringify } from './utils';

export type JobType =
  | 'probe'
  | 'analyze'
  | 'regression'
  | 'rca'
  | 'fix_pr'
  | 'notify'
  | 'chaos';

export interface JobHandlerContext<P> {
  jobId: string;
  payload: P;
  attempt: number;
}

export type JobHandler<P = unknown, R = unknown> = (
  ctx: JobHandlerContext<P>
) => Promise<R>;

const handlers = new Map<JobType, JobHandler>();

export function registerHandler<P, R>(type: JobType, handler: JobHandler<P, R>) {
  handlers.set(type, handler as JobHandler);
}

export interface EnqueueOptions {
  scheduledAt?: Date;
  maxAttempts?: number;
}

export async function enqueue<P>(
  type: JobType,
  payload: P,
  options: EnqueueOptions = {}
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      type,
      payload: stringify(payload),
      scheduledAt: options.scheduledAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 3,
    },
  });
  return job.id;
}

export interface RunOptions {
  limit?: number;
  now?: Date;
}

// Drain pending jobs whose scheduledAt has passed. Returns the IDs that ran.
// Callers (cron, dev tick loop, on-demand from an API route) decide cadence.
export async function drain(options: RunOptions = {}): Promise<string[]> {
  const limit = options.limit ?? 10;
  const now = options.now ?? new Date();

  const candidates = await prisma.job.findMany({
    where: { status: 'pending', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });

  const ran: string[] = [];
  for (const job of candidates) {
    const claim = await prisma.job.updateMany({
      where: { id: job.id, status: 'pending' },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;

    const handler = handlers.get(job.type as JobType);
    if (!handler) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'failed', error: `no handler registered for type "${job.type}"`, completedAt: new Date() },
      });
      ran.push(job.id);
      continue;
    }

    try {
      const result = await handler({
        jobId: job.id,
        payload: parseJson<unknown>(job.payload, {}),
        attempt: job.attempts + 1,
      });
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          result: result === undefined || result === null ? null : stringify(result),
          completedAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attemptsAfter = job.attempts + 1;
      const exhausted = attemptsAfter >= job.maxAttempts;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: exhausted ? 'failed' : 'pending',
          error: message,
          completedAt: exhausted ? new Date() : null,
          // backoff: next attempt in 2^attempts seconds
          scheduledAt: exhausted ? job.scheduledAt : new Date(Date.now() + 1000 * 2 ** attemptsAfter),
        },
      });
    }
    ran.push(job.id);
  }

  return ran;
}

// Dev convenience: a setInterval-based loop. Only started explicitly
// (never on import) so tests and serverless deployments stay clean.
let timer: NodeJS.Timeout | null = null;
export function startWorkerLoop(intervalMs = 5000): () => void {
  if (timer) return () => stopWorkerLoop();
  timer = setInterval(() => {
    drain({ limit: 5 }).catch((err) => {
      console.error('[jobs] drain failed:', err);
    });
  }, intervalMs);
  return () => stopWorkerLoop();
}

export function stopWorkerLoop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
