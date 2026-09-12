import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedService } from '@/lib/auth-helpers';
import { OnboardingError, ServicePatch, updateService } from '@/lib/onboarding';
import { deriveContractTopology } from '@/lib/analyze';
import { record, context } from '@/lib/audit';

export async function GET(_req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id);
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const service = await prisma.service.findUnique({
    where: { id: params.serviceId },
    include: { contract: true, probes: { orderBy: { createdAt: 'asc' } } },
  });
  return NextResponse.json({ service });
}

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id, 'editor');
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = ServicePatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  try {
    const service = await updateService(params.serviceId, parsed.data);
    // deployedUrl participates in edge resolution; name does too.
    if (parsed.data.deployedUrl !== undefined || parsed.data.name !== undefined) {
      const arch = await prisma.architecture.findUnique({ where: { id: svc.architectureId }, select: { demo: true } });
      if (!arch?.demo) await deriveContractTopology(svc.architectureId);
    }
    void record({
      action: 'service.update',
      architectureId: svc.architectureId,
      userId: session.user.id,
      targetType: 'service',
      targetId: svc.id,
      payload: parsed.data as Record<string, unknown>,
      ...context(req),
    });
    return NextResponse.json({ service });
  } catch (err) {
    if (err instanceof OnboardingError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id, 'editor');
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.service.delete({ where: { id: svc.id } });
  const arch = await prisma.architecture.findUnique({ where: { id: svc.architectureId }, select: { demo: true } });
  if (!arch?.demo) await deriveContractTopology(svc.architectureId);
  void record({
    action: 'service.delete',
    architectureId: svc.architectureId,
    userId: session.user.id,
    targetType: 'service',
    targetId: svc.id,
    payload: { name: svc.name },
    ...context(req),
  });
  return NextResponse.json({ ok: true });
}
