import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { executeRegressionRun, listFlowsForArchitecture } from '@/lib/regression-engine';

export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [runs, flows] = await Promise.all([
    prisma.regressionRun.findMany({
      where: { architectureId: params.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    listFlowsForArchitecture(params.id),
  ]);
  return NextResponse.json({ runs, flows });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const runId = await executeRegressionRun(params.id, {
    triggeredBy: session.user.email ?? 'manual',
  });
  return NextResponse.json({ runId });
}
