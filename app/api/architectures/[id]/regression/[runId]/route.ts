import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function GET(_req: Request, { params }: { params: { id: string; runId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.regressionRun.findFirst({
    where: { id: params.runId, architectureId: params.id },
    include: {
      steps: {
        orderBy: { stepOrder: 'asc' },
        include: { service: { select: { id: true, name: true, language: true, framework: true } } },
      },
    },
  });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ run });
}
