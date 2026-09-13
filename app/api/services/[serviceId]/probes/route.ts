import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedService } from '@/lib/auth-helpers';
import { stringify } from '@/lib/utils';
import { validateProbeTarget } from '@/lib/net-guard';
import { encryptSecret, redactUrl } from '@/lib/secrets';
import { publicProbe } from '@/lib/probes';

const isDatastore = (t: string) => t === 'postgres' || t === 'redis';

const ProbeInput = z.object({
  name: z.string().min(1),
  type: z.enum(['http', 'tcp', 'postgres', 'redis']),
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
  return NextResponse.json({ probes: probes.map(publicProbe) });
}

export async function POST(req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id, 'editor');
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = ProbeInput.parse(await req.json());
  const problem = await validateProbeTarget(body.type, body.target);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const probe = await prisma.probe.create({
    data: {
      serviceId: params.serviceId,
      name: body.name,
      type: body.type,
      // Datastore connection strings carry passwords: encrypt, keep a redacted copy for display.
      target: isDatastore(body.type) ? redactUrl(body.target) : body.target,
      secret: isDatastore(body.type) ? encryptSecret(body.target) : null,
      intervalSec: body.intervalSec ?? 30,
      timeoutSec: body.timeoutSec ?? 5,
      expectStatus: body.expectStatus ?? null,
      expectBodyRegex: body.expectBodyRegex ?? null,
      headers: body.headers ? encryptSecret(stringify(body.headers)) : null,
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json({ probe: publicProbe(probe) }, { status: 201 });
}
