import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { deriveContractTopology } from '@/lib/analyze';
import { loadDependencyReview } from '@/lib/topology/insights';
import { record, context } from '@/lib/audit';

// Undo a dependency decision.
export async function DELETE(req: Request, { params }: { params: { id: string; overrideId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'editor');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = await prisma.edgeOverride.deleteMany({ where: { id: params.overrideId, architectureId: params.id } });
  if (res.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deriveContractTopology(params.id);
  void record({ action: 'topology.edit', architectureId: params.id, userId: session.user.id, targetType: 'edge', targetId: params.overrideId, payload: { undo: true }, ...context(req) });
  return NextResponse.json(await loadDependencyReview(params.id));
}
