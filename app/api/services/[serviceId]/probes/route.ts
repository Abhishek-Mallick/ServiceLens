import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedService } from '@/lib/auth-helpers';
import { stringify } from '@/lib/utils';

const ProbeInput = z.object({
  name: z.string().min(1),
  type: z.enum(['http', 'tcp', 'ping', 'cmd']),
  target: z.string().min(1),
  intervalSec: z.number().int().min(5).max(3600).optional(),
  timeoutSec: z.number().int().min(1).max(60).optional(),
  expectStatus: z.number().int().nullable().optional(),
  expectBodyRegex: z.string().nullable().optional(),
  headers: z.record(z.string()).nullable().optional(),
  enabled: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id);
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const probes = await prisma.probe.findMany({ where: { serviceId: params.serviceId }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ probes });
}

export async function POST(req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id);
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = ProbeInput.parse(await req.json());
  const probe = await prisma.probe.create({
    data: {
      serviceId: params.serviceId,
      name: body.name,
      type: body.type,
      target: body.target,
      intervalSec: body.intervalSec ?? 30,
      timeoutSec: body.timeoutSec ?? 5,
      expectStatus: body.expectStatus ?? null,
      expectBodyRegex: body.expectBodyRegex ?? null,
      headers: body.headers ? stringify(body.headers) : null,
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json({ probe }, { status: 201 });
}
