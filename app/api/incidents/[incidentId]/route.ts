import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedIncident } from '@/lib/auth-helpers';

export async function GET(_req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const incident = await prisma.incident.findUnique({
    where: { id: params.incidentId },
    include: {
      service: true,
      rule: true,
      assignee: { select: { id: true, name: true, email: true } },
      events: {
        orderBy: { at: 'asc' },
        include: { byUser: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  return NextResponse.json({ incident });
}
