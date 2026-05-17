import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './prisma';

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session;
}

export async function requireOwnedArchitecture(architectureId: string, userId: string) {
  return prisma.architecture.findFirst({ where: { id: architectureId, userId } });
}

export async function requireOwnedService(serviceId: string, userId: string) {
  return prisma.service.findFirst({
    where: { id: serviceId, architecture: { userId } },
    include: { architecture: { select: { id: true, userId: true } } },
  });
}

export async function requireOwnedIncident(incidentId: string, userId: string) {
  return prisma.incident.findFirst({
    where: { id: incidentId, architecture: { userId } },
  });
}
