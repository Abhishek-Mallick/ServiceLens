import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './prisma';
import { getRole, atLeast, type Role } from './membership';

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session;
}

// Membership-based ownership check. `minRole` defaults to viewer (read access).
// Returns the architecture if the user has at least that role on it.
export async function requireOwnedArchitecture(architectureId: string, userId: string, minRole: Role = 'viewer') {
  const role = await getRole(architectureId, userId);
  if (!atLeast(role, minRole)) return null;
  return prisma.architecture.findUnique({ where: { id: architectureId } });
}

export async function requireOwnedService(serviceId: string, userId: string, minRole: Role = 'viewer') {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { architecture: { select: { id: true, userId: true } } },
  });
  if (!svc) return null;
  const role = await getRole(svc.architectureId, userId);
  if (!atLeast(role, minRole)) return null;
  return svc;
}

export async function requireOwnedIncident(incidentId: string, userId: string, minRole: Role = 'viewer') {
  const inc = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!inc) return null;
  const role = await getRole(inc.architectureId, userId);
  if (!atLeast(role, minRole)) return null;
  return inc;
}
