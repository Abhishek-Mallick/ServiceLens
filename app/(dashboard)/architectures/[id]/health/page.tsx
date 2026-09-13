import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { HealthDashboard } from '@/components/health/health-dashboard';
import { visibleTo } from '@/lib/access';
import { atLeast, getRole } from '@/lib/membership';

export const dynamic = 'force-dynamic';

export default async function HealthPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, ...visibleTo(session.user.id) },
    include: {
      services: {
        include: {
          healthHistory: {
            orderBy: { checkedAt: 'desc' },
            take: 96, // last ~48h at 30min intervals
          },
        },
      },
    },
  });
  if (!architecture) notFound();

  const servicesData = architecture.services.map((s) => ({
    id: s.id,
    name: s.name,
    framework: s.framework,
    language: s.language,
    healthStatus: s.healthStatus,
    healthEndpoint: s.healthEndpoint,
    lastHealthCheck: s.lastHealthCheck?.toISOString() ?? null,
    simulated: s.simulated,
    history: s.healthHistory
      .slice()
      .reverse()
      .map((h) => ({
        status: h.status,
        responseTime: h.responseTime,
        checkedAt: h.checkedAt.toISOString(),
      })),
  }));

  const canEdit = atLeast(await getRole(params.id, session.user.id), 'editor');
  return <HealthDashboard architectureId={params.id} initialServices={servicesData} canEdit={canEdit} />;
}
