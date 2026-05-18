import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

const Patch = z.object({
  enabled: z.boolean().optional(),
  schedule: z.string().optional(),
  durationSec: z.number().int().min(30).max(86400).optional(),
});

async function loadOwned(id: string, userId: string) {
  return prisma.chaosSchedule.findFirst({ where: { id, architecture: { userId } } });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sched = await loadOwned(params.id, session.user.id);
  if (!sched) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = Patch.parse(await req.json());
  const updated = await prisma.chaosSchedule.update({ where: { id: params.id }, data: body });
  return NextResponse.json({ schedule: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sched = await loadOwned(params.id, session.user.id);
  if (!sched) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.chaosSchedule.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
