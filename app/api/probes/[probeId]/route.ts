import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';
import { stringify } from '@/lib/utils';
import { publicProbe, runProbe, toConfig } from '@/lib/probes';
import { requireRole } from '@/lib/membership';
import { validateProbeTarget } from '@/lib/net-guard';
import { decryptSecret, encryptSecret, redactUrl } from '@/lib/secrets';

const PatchInput = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['http', 'tcp', 'postgres', 'redis']).optional(),
  target: z.string().min(1).optional(),
  intervalSec: z.number().int().min(5).max(3600).optional(),
  timeoutSec: z.number().int().min(1).max(60).optional(),
  expectStatus: z.number().int().nullable().optional(),
  expectBodyRegex: z.string().nullable().optional(),
  headers: z.record(z.string()).nullable().optional(),
  enabled: z.boolean().optional(),
});

// Editors and owners may change or run probes.
async function loadOwned(probeId: string, userId: string) {
  const probe = await prisma.probe.findUnique({ where: { id: probeId }, include: { service: { select: { architectureId: true } } } });
  if (!probe) return null;
  return (await requireRole(probe.service.architectureId, userId, 'editor')) ? probe : null;
}

export async function PATCH(req: Request, { params }: { params: { probeId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const probe = await loadOwned(params.probeId, session.user.id);
  if (!probe) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = PatchInput.parse(await req.json());
  const type = body.type ?? probe.type;
  const datastore = type === 'postgres' || type === 'redis';
  if (body.target !== undefined || body.type !== undefined) {
    // For datastores the stored `target` is redacted; validate the real connection string.
    const plain = body.target ?? (datastore ? decryptSecret(probe.secret) ?? '' : probe.target);
    const problem = await validateProbeTarget(type, plain);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  const { target, headers, ...rest } = body;
  const updated = await prisma.probe.update({
    where: { id: params.probeId },
    data: {
      ...rest,
      ...(target !== undefined
        ? datastore
          ? { target: redactUrl(target), secret: encryptSecret(target) }
          : { target, secret: null }
        : {}),
      headers: headers === undefined ? undefined : headers ? encryptSecret(stringify(headers)) : null,
    },
  });
  return NextResponse.json({ probe: publicProbe(updated) });
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
