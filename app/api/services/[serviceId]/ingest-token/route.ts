import { NextResponse } from 'next/server';
import { requireSession, requireOwnedService } from '@/lib/auth-helpers';
import { ensureIngestToken, generateIngestToken } from '@/lib/logs';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id);
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const token = await ensureIngestToken(params.serviceId);
  return NextResponse.json({ token });
}

// POST rotates the token.
export async function POST(_req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id);
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const token = generateIngestToken();
  await prisma.service.update({ where: { id: params.serviceId }, data: { ingestToken: token } });
  return NextResponse.json({ token });
}
