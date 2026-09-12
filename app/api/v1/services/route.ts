import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiKeyAuth } from '@/lib/api-keys';
import { serviceView } from '@/lib/v1';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await apiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const services = await prisma.service.findMany({ where: { architectureId: auth.architectureId }, include: { contract: true }, orderBy: { name: 'asc' } });
  return NextResponse.json({ services: services.map(serviceView) });
}
