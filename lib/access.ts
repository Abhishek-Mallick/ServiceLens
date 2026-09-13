// Prisma filters for "architectures this user may see": the creator, or anyone
// with an ArchitectureMember row (any role). Use in list/detail queries; use
// requireOwnedArchitecture(…, 'editor' | 'owner') from lib/auth-helpers for mutations.

import type { Prisma } from '@prisma/client';

export function visibleTo(userId: string) {
  return {
    OR: [{ userId }, { members: { some: { userId } } }],
  } satisfies Prisma.ArchitectureWhereInput;
}
