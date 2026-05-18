import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { applyChaos } from '@/lib/chaos';
import { record, context } from '@/lib/audit';

const Input = z.object({
  serviceId: z.string().optional(),
  action: z.enum(['kill_service', 'degrade', 'latency_spike']).default('kill_service'),
  durationSec: z.number().int().min(30).max(86400).default(300),
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
    const owns = await prisma.service.findFirst({ where: { id: serviceId, architectureId: params.id }, select: { id: true } });
    if (!owns) return NextResponse.json({ error: 'service not in architecture' }, { status: 400 });
  }

  const result = await applyChaos({
    architectureId: params.id,
    serviceId,
    action: body.action,
    durationSec: body.durationSec,
    byUserId: session.user.id,
  });
  void record({
    action: 'chaos.now',
    architectureId: params.id,
    userId: session.user.id,
    targetType: 'service',
    targetId: serviceId,
    payload: { action: body.action, durationSec: body.durationSec },
    ...context(req),
  });
  return NextResponse.json(result, { status: 201 });
}
