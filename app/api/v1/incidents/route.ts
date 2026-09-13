import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiKeyAuth } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';

// GET /api/v1/incidents?status=open|all — "is anything broken right now?"
export async function GET(req: Request) {
  const auth = await apiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const status = new URL(req.url).searchParams.get('status') ?? 'open';
  const incidents = await prisma.incident.findMany({
    where: { architectureId: auth.architectureId, ...(status === 'all' ? {} : { status: { in: ['open', 'acknowledged', 'mitigated'] } }) },
    select: {
      id: true, title: true, severity: true, status: true, openedAt: true, ackedAt: true, resolvedAt: true,
      service: { select: { name: true } },
      oncall: { select: { name: true, email: true } },
      remediations: { where: { status: 'opened' }, select: { prUrl: true, prState: true }, take: 1 },
    },
    orderBy: { openedAt: 'desc' },
    take: 50,
  });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return NextResponse.json({
    incidents: incidents.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      service: i.service?.name ?? null,
      oncall: i.oncall,
      fixPr: i.remediations[0] ?? null,
      openedAt: i.openedAt,
      ackedAt: i.ackedAt,
      resolvedAt: i.resolvedAt,
      url: `${base}/architectures/${auth.architectureId}/incidents/${i.id}`,
    })),
  });
}
