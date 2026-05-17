import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { triggerSyntheticIncident } from '@/lib/incidents';
import { prisma } from '@/lib/prisma';

const Input = z.object({
  serviceId: z.string().optional(),
  durationSec: z.number().int().min(60).max(3600).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = Input.parse(await req.json().catch(() => ({})));
  let serviceId = body.serviceId;
  if (!serviceId) {
    const any = await prisma.service.findFirst({ where: { architectureId: params.id }, select: { id: true } });
    if (!any) return NextResponse.json({ error: 'No services in architecture' }, { status: 400 });
    serviceId = any.id;
  } else {
    const owns = await prisma.service.findFirst({
      where: { id: serviceId, architectureId: params.id },
      select: { id: true },
    });
    if (!owns) return NextResponse.json({ error: 'Service not in architecture' }, { status: 400 });
  }

  const { id } = await triggerSyntheticIncident({
    architectureId: params.id,
    serviceId,
    durationSec: body.durationSec,
    byUserId: session.user.id,
  });
  return NextResponse.json({ incidentId: id }, { status: 201 });
}
