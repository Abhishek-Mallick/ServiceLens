import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      services: { orderBy: { createdAt: 'asc' } },
      _count: { select: { regressionRuns: true } },
    },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ architecture });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.architecture.deleteMany({
    where: { id: params.id, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
