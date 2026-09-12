import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { refreshRoster } from '@/lib/oncall/roster';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'editor');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { entries, errors } = await refreshRoster(params.id);
  const src = await prisma.oncallSource.findUnique({ where: { architectureId: params.id } });
  return NextResponse.json({ roster: entries, errors, lastFetchedAt: src?.lastFetchedAt ?? null, lastError: src?.lastError ?? null });
}
