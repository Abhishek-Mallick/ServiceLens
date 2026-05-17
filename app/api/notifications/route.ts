import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const unread = url.searchParams.get('unread') === '1';
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, ...(unread ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: session.user.id, readAt: null } });
  return NextResponse.json({ notifications, unreadCount });
}

// Mark all as read
export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
