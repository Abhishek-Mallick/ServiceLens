import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiKeyAuth } from '@/lib/api-keys';
import { serviceView } from '@/lib/v1';

export const dynamic = 'force-dynamic';

// Who am I / what does this key manage. Good first call to verify a key.
export async function GET(req: Request) {
  const auth = await apiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const arch = await prisma.architecture.findUnique({
    where: { id: auth.architectureId },
    include: { services: { include: { contract: true }, orderBy: { name: 'asc' } }, _count: { select: { incidents: { where: { status: { in: ['open', 'acknowledged'] } } } } } },
  });
  if (!arch) return NextResponse.json({ error: { code: 'not_found', message: 'Architecture not found' } }, { status: 404 });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return NextResponse.json({
    architecture: { id: arch.id, name: arch.name, url: `${base}/architectures/${arch.id}`, openIncidents: arch._count.incidents },
    services: arch.services.map(serviceView),
  });
}
