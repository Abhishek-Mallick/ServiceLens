import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

type PrismaPromiseReturn<T> = T extends Prisma.PrismaPromise<infer R> ? R : never;

/** Run read queries sequentially on one pooled connection (Neon connection_limit=1). */
export async function readBatch<T extends readonly Prisma.PrismaPromise<unknown>[]>(
  queries: [...T],
): Promise<{ [K in keyof T]: PrismaPromiseReturn<T[K]> }> {
  return prisma.$transaction(queries) as Promise<{ [K in keyof T]: PrismaPromiseReturn<T[K]> }>;
}
