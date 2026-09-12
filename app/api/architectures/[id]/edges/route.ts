import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { deriveContractTopology } from '@/lib/analyze';
import { loadDependencyReview } from '@/lib/topology/insights';
import { record, context } from '@/lib/audit';

const Input = z.object({
  fromServiceId: z.string().min(1),
  toServiceId: z.string().min(1).nullable().optional(),
  envVar: z.string().max(200).default(''),
  action: z.enum(['confirm', 'reject', 'manual', 'ignore']),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await loadDependencyReview(params.id));
}

// Record a decision about a dependency and re-derive the topology.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'editor');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (arch.demo) return NextResponse.json({ error: 'The demo topology is read-only.' }, { status: 400 });

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const { fromServiceId, envVar, action } = parsed.data;
  const toServiceId = parsed.data.toServiceId ?? null;

  if (action !== 'ignore' && !toServiceId) return NextResponse.json({ error: `"${action}" needs a target service.` }, { status: 400 });
  if (action === 'ignore' && !envVar) return NextResponse.json({ error: '"ignore" needs the env var to ignore.' }, { status: 400 });
  if (toServiceId === fromServiceId) return NextResponse.json({ error: 'A service cannot depend on itself.' }, { status: 400 });
  const ids = [fromServiceId, ...(toServiceId ? [toServiceId] : [])];
  const count = await prisma.service.count({ where: { id: { in: ids }, architectureId: params.id } });
  if (count !== ids.length) return NextResponse.json({ error: 'Service not in this architecture.' }, { status: 400 });

  if (envVar && action !== 'reject') {
    // A new decision for this dependency replaces the previous one.
    await prisma.edgeOverride.deleteMany({ where: { architectureId: params.id, fromServiceId, envVar, action: { in: ['confirm', 'manual', 'ignore'] } } });
  }
  const dupe = await prisma.edgeOverride.findFirst({ where: { architectureId: params.id, fromServiceId, toServiceId, envVar, action } });
  if (!dupe) {
    await prisma.edgeOverride.create({ data: { architectureId: params.id, fromServiceId, toServiceId, envVar, action, createdById: session.user.id } });
  }
  await deriveContractTopology(params.id);
  void record({ action: 'topology.edit', architectureId: params.id, userId: session.user.id, targetType: 'edge', payload: parsed.data, ...context(req) });
  return NextResponse.json(await loadDependencyReview(params.id));
}
