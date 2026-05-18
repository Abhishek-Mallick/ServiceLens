// Architecture membership — multi-user authz model.
//
// Phase 7 upgrade: ownership is no longer encoded only by `Architecture.userId`
// (the creator). The `ArchitectureMember` table is the source of truth for
// "who can see/edit this architecture and at what role". The original
// `userId` column still exists as the immutable creator pointer.

import { prisma } from './prisma';

export type Role = 'owner' | 'editor' | 'viewer';

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export function atLeast(have: Role | string | null | undefined, need: Role): boolean {
  if (!have) return false;
  const h = RANK[have as Role];
  const n = RANK[need];
  if (h == null || n == null) return false;
  return h >= n;
}

// Returns the user's role on this architecture, auto-healing membership for
// the creator (so legacy architectures created before Phase 7 still work).
export async function getRole(architectureId: string, userId: string): Promise<Role | null> {
  const membership = await prisma.architectureMember.findUnique({
    where: { architectureId_userId: { architectureId, userId } },
  });
  if (membership) return membership.role as Role;

  // Self-heal: the original creator gets implicit owner membership.
  const arch = await prisma.architecture.findUnique({
    where: { id: architectureId },
    select: { id: true, userId: true },
  });
  if (arch && arch.userId === userId) {
    await prisma.architectureMember.upsert({
      where: { architectureId_userId: { architectureId, userId } },
      create: { architectureId, userId, role: 'owner', acceptedAt: new Date() },
      update: {},
    });
    return 'owner';
  }
  return null;
}

export async function requireRole(architectureId: string, userId: string, need: Role): Promise<Role | null> {
  const role = await getRole(architectureId, userId);
  return role && atLeast(role, need) ? role : null;
}

export async function listMembers(architectureId: string) {
  return prisma.architectureMember.findMany({
    where: { architectureId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { invitedAt: 'asc' },
  });
}

export async function inviteMember(architectureId: string, email: string, role: Role): Promise<{ memberId: string; created: boolean } | { error: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { error: 'No user with that email — they need to sign up first.' };
  const existing = await prisma.architectureMember.findUnique({
    where: { architectureId_userId: { architectureId, userId: user.id } },
  });
  if (existing) return { memberId: existing.id, created: false };
  const m = await prisma.architectureMember.create({
    data: { architectureId, userId: user.id, role, acceptedAt: new Date() },
  });
  return { memberId: m.id, created: true };
}

export async function removeMember(architectureId: string, userId: string): Promise<void> {
  await prisma.architectureMember.deleteMany({ where: { architectureId, userId } });
}

export async function setRole(architectureId: string, userId: string, role: Role): Promise<void> {
  await prisma.architectureMember.update({
    where: { architectureId_userId: { architectureId, userId } },
    data: { role },
  });
}

// Returns architectures the user can see (owner|editor|viewer membership OR legacy creator).
export async function listForUser(userId: string) {
  const memberships = await prisma.architectureMember.findMany({
    where: { userId },
    select: { architectureId: true },
  });
  const memberArchIds = memberships.map((m) => m.architectureId);
  return prisma.architecture.findMany({
    where: {
      OR: [
        { id: { in: memberArchIds } },
        { userId }, // legacy creator
      ],
    },
    include: { _count: { select: { services: true, regressionRuns: true } } },
    orderBy: { updatedAt: 'desc' },
  });
}
