import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

// Lightweight global search powering the ⌘K palette. Searches architectures,
// services, and open incidents owned by the current user.
export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) {
    // Empty query: return the user's most-recent architectures + open incidents so the
    // palette has useful navigation suggestions even before they type.
    const [arch, inc] = await Promise.all([
      prisma.architecture.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, name: true },
      }),
      prisma.incident.findMany({
        where: { architecture: { userId: session.user.id }, status: { in: ['open', 'acknowledged'] } },
        orderBy: { openedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, architectureId: true, severity: true },
      }),
    ]);
    return NextResponse.json({
      architectures: arch,
      services: [],
      incidents: inc,
    });
  }

  const [arch, svc, inc] = await Promise.all([
    prisma.architecture.findMany({
      where: { userId: session.user.id, name: { contains: q, mode: 'insensitive' } },
      take: 6,
      select: { id: true, name: true },
    }),
    prisma.service.findMany({
      where: { architecture: { userId: session.user.id }, name: { contains: q, mode: 'insensitive' } },
      take: 8,
      select: { id: true, name: true, architectureId: true, framework: true },
    }),
    prisma.incident.findMany({
      where: {
        architecture: { userId: session.user.id },
        title: { contains: q, mode: 'insensitive' },
      },
      take: 6,
      orderBy: { openedAt: 'desc' },
      select: { id: true, title: true, architectureId: true, severity: true, status: true },
    }),
  ]);
  return NextResponse.json({ architectures: arch, services: svc, incidents: inc });
}
