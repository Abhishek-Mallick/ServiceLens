import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiKeyAuth, v1Error } from '@/lib/api-keys';
import { createService, OnboardingError, ServiceInput, updateService } from '@/lib/onboarding';
import { deriveContractTopology } from '@/lib/analyze';
import { kick } from '@/lib/jobs';
import { record } from '@/lib/audit';
import { findServiceByName, serviceView } from '@/lib/v1';

export const dynamic = 'force-dynamic';

const Upsert = ServiceInput.omit({ name: true }).extend({ analyze: z.boolean().default(true) });

export async function GET(req: Request, { params }: { params: { name: string } }) {
  const auth = await apiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const svc = await findServiceByName(auth.architectureId, decodeURIComponent(params.name));
  if (!svc) return v1Error(404, 'not_found', `No service named "${decodeURIComponent(params.name)}".`);
  const [full, incidents] = await Promise.all([
    prisma.service.findUnique({ where: { id: svc.id }, include: { contract: true } }),
    prisma.incident.findMany({
      where: { serviceId: svc.id, status: { in: ['open', 'acknowledged', 'mitigated'] } },
      select: { id: true, title: true, severity: true, status: true, openedAt: true },
      orderBy: { openedAt: 'desc' },
    }),
  ]);
  return NextResponse.json({ service: serviceView(full!), openIncidents: incidents });
}

// Idempotent register-or-update by name — safe to call from every deploy.
export async function PUT(req: Request, { params }: { params: { name: string } }) {
  const auth = await apiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const name = decodeURIComponent(params.name).trim();
  const parsed = Upsert.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return v1Error(400, 'invalid_input', 'Invalid body.', parsed.error.flatten().fieldErrors);
  const { analyze, ...input } = parsed.data;

  try {
    const existing = await findServiceByName(auth.architectureId, name);
    const service = existing
      ? await updateService(existing.id, { repoUrl: input.repoUrl, branch: input.branch, deployedUrl: input.deployedUrl, healthPath: input.healthPath })
      : await createService(auth.architectureId, { ...input, name });
    if (existing && input.deployedUrl !== undefined) await deriveContractTopology(auth.architectureId);
    if (analyze) await kick('analyze', { architectureId: auth.architectureId, serviceIds: [service.id] });
    void record({
      action: existing ? 'service.update' : 'service.add',
      architectureId: auth.architectureId,
      targetType: 'service',
      targetId: service.id,
      payload: { via: 'api_key', keyId: auth.keyId, name },
    });
    const full = await prisma.service.findUnique({ where: { id: service.id }, include: { contract: true } });
    return NextResponse.json({ service: serviceView(full!), created: !existing, analysis: analyze ? 'queued' : 'skipped' }, { status: existing ? 200 : 201 });
  } catch (err) {
    if (err instanceof OnboardingError) return v1Error(err.status, 'invalid_input', err.message);
    throw err;
  }
}

export async function DELETE(req: Request, { params }: { params: { name: string } }) {
  const auth = await apiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const svc = await findServiceByName(auth.architectureId, decodeURIComponent(params.name));
  if (!svc) return v1Error(404, 'not_found', `No service named "${decodeURIComponent(params.name)}".`);
  await prisma.service.delete({ where: { id: svc.id } });
  await deriveContractTopology(auth.architectureId);
  void record({ action: 'service.delete', architectureId: auth.architectureId, targetType: 'service', targetId: svc.id, payload: { via: 'api_key', keyId: auth.keyId, name: svc.name } });
  return NextResponse.json({ ok: true });
}
