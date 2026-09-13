import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { record, context } from '@/lib/audit';

// Revoke (kept for the audit trail; a revoked key can never authenticate again).
export async function DELETE(req: Request, { params }: { params: { id: string; keyId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = await prisma.apiKey.updateMany({ where: { id: params.keyId, architectureId: params.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  void record({ action: 'apikey.revoke', architectureId: params.id, userId: session.user.id, targetType: 'apikey', targetId: params.keyId, ...context(req) });
  return NextResponse.json({ ok: true });
}
