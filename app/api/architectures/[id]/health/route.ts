import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { probeArchitecture } from '@/lib/probes';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      services: {
        include: {
          healthHistory: {
            orderBy: { checkedAt: 'desc' },
            take: 48,
          },
        },
      },
    },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ architecture });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const results = await probeArchitecture(params.id);
  return NextResponse.json({ results });
}
