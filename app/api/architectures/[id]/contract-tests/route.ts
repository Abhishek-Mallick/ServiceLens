import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { loadContractPlan, runContractTests } from '@/lib/contract-tests';
import { record, context } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [plan, runs] = await Promise.all([
    loadContractPlan(params.id),
    prisma.regressionRun.findMany({
      where: { architectureId: params.id, simulated: false },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, status: true, totalSteps: true, passedSteps: true, failedSteps: true, triggeredBy: true, createdAt: true, completedAt: true },
    }),
  ]);
  return NextResponse.json({ plan, runs, intervalMin: arch.contractTestIntervalMin });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'editor');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (arch.demo) return NextResponse.json({ error: 'The demo uses simulated regression runs.' }, { status: 400 });
  const result = await runContractTests(params.id, { triggeredBy: session.user.email ?? 'manual' });
  void record({ action: 'contract_tests.run', architectureId: params.id, userId: session.user.id, targetType: 'regression_run', targetId: result.runId, payload: { passed: result.passed, failed: result.failed }, ...context(req) });
  return NextResponse.json(result, { status: 201 });
}
