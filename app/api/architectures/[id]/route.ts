import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { visibleTo } from '@/lib/access';
import { requireOwnedArchitecture } from '@/lib/auth-helpers';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, ...visibleTo(session.user.id) },
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
  const owner = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.architecture.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
