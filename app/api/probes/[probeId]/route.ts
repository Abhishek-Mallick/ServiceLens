import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';
import { stringify } from '@/lib/utils';
import { runProbe, toConfig } from '@/lib/probes';

const PatchInput = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['http', 'tcp', 'ping', 'cmd']).optional(),
  target: z.string().min(1).optional(),
  intervalSec: z.number().int().min(5).max(3600).optional(),
  timeoutSec: z.number().int().min(1).max(60).optional(),
  expectStatus: z.number().int().nullable().optional(),
  expectBodyRegex: z.string().nullable().optional(),
  headers: z.record(z.string()).nullable().optional(),
  enabled: z.boolean().optional(),
});

async function loadOwned(probeId: string, userId: string) {
  return prisma.probe.findFirst({
    where: { id: probeId, service: { architecture: { userId } } },
  });
}

export async function PATCH(req: Request, { params }: { params: { probeId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const probe = await loadOwned(params.probeId, session.user.id);
  if (!probe) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = PatchInput.parse(await req.json());
  const updated = await prisma.probe.update({
    where: { id: params.probeId },
    data: {
      ...body,
      headers: body.headers === undefined ? undefined : body.headers ? stringify(body.headers) : null,
    },
  });
  return NextResponse.json({ probe: updated });
}

export async function DELETE(_req: Request, { params }: { params: { probeId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const probe = await loadOwned(params.probeId, session.user.id);
  if (!probe) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.probe.delete({ where: { id: params.probeId } });
  return NextResponse.json({ ok: true });
}

// POST = run-now
export async function POST(_req: Request, { params }: { params: { probeId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const probe = await loadOwned(params.probeId, session.user.id);
  if (!probe) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const result = await runProbe(toConfig(probe));
  await prisma.probe.update({ where: { id: probe.id }, data: { lastRunAt: new Date() } });
  return NextResponse.json({ result });
}
