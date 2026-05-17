import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.notification.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
