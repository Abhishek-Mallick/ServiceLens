import { NextResponse } from 'next/server';
import { demoOnlyResponse } from '@/lib/demo';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { executeRegressionRun, listFlowsForArchitecture } from '@/lib/regression-engine';
import { visibleTo } from '@/lib/access';
import { requireOwnedArchitecture } from '@/lib/auth-helpers';

export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, ...visibleTo(session.user.id) },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const runs = await prisma.regressionRun.findMany({
    where: { architectureId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
  const flows = await listFlowsForArchitecture(params.id);
  return NextResponse.json({ runs, flows });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await requireOwnedArchitecture(params.id, session.user.id, 'editor');
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!architecture.demo) return demoOnlyResponse('Regression runs');

  const runId = await executeRegressionRun(params.id, {
    triggeredBy: session.user.email ?? 'manual',
  });
  return NextResponse.json({ runId });
}
