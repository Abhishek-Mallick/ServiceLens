import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const where = {
    architectureId: params.id,
    ...(status ? { status } : {}),
  };
  const incidents = await prisma.incident.findMany({
    where,
    include: {
      service: { select: { id: true, name: true } },
      rule: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { openedAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ incidents });
}
