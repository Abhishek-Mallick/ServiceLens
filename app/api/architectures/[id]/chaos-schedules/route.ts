import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { parseSchedule } from '@/lib/chaos';

const Input = z.object({
  targetServiceId: z.string(),
  schedule: z.string().min(1),
  action: z.enum(['kill_service', 'degrade', 'latency_spike']),
  durationSec: z.number().int().min(30).max(86400).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const schedules = await prisma.chaosSchedule.findMany({
    where: { architectureId: params.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ schedules });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = Input.parse(await req.json());

  if (!parseSchedule(body.schedule)) {
    return NextResponse.json({ error: "schedule must be 'every Nm/h/s' or 'HH:MM'" }, { status: 400 });
  }
  const ownsSvc = await prisma.service.findFirst({
    where: { id: body.targetServiceId, architectureId: params.id },
    select: { id: true },
  });
  if (!ownsSvc) return NextResponse.json({ error: 'target service not in architecture' }, { status: 400 });

  const schedule = await prisma.chaosSchedule.create({
    data: {
      architectureId: params.id,
      targetServiceId: body.targetServiceId,
      schedule: body.schedule,
      action: body.action,
      durationSec: body.durationSec ?? 300,
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json({ schedule }, { status: 201 });
}
