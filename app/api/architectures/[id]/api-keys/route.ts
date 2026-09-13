import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { generateApiKey } from '@/lib/api-keys';
import { record, context } from '@/lib/audit';

const select = { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true } as const;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const keys = await prisma.apiKey.findMany({ where: { architectureId: params.id }, select, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ keys });
}

// Returns the plaintext key exactly once.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (arch.demo) return NextResponse.json({ error: 'API keys are not available on the demo architecture.' }, { status: 400 });
  const body = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Give the key a name (e.g. "GitHub Actions").' }, { status: 400 });

  const { key, prefix, hash } = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: { architectureId: params.id, name: body.data.name, prefix, hash, createdById: session.user.id },
    select,
  });
  void record({ action: 'apikey.create', architectureId: params.id, userId: session.user.id, targetType: 'apikey', targetId: apiKey.id, payload: { name: apiKey.name }, ...context(req) });
  return NextResponse.json({ key, apiKey }, { status: 201 });
}
