// Shared shapes for the public v1 API (API-key authenticated).
import { prisma } from './prisma';
import { parseJson } from './utils';

export async function findServiceByName(architectureId: string, name: string) {
  return prisma.service.findFirst({ where: { architectureId, name: { equals: name, mode: 'insensitive' } } });
}

type ServiceRow = NonNullable<Awaited<ReturnType<typeof findServiceByName>>>;

export function serviceView(s: ServiceRow & { contract?: { endpoints: string; outboundDeps: string; commitSha: string | null; extractedAt: Date } | null }) {
  return {
    id: s.id,
    name: s.name,
    repoUrl: s.repoUrl,
    branch: s.branch,
    deployedUrl: s.deployedUrl,
    healthPath: s.healthPath,
    health: { status: s.healthStatus, lastCheckedAt: s.lastHealthCheck, heartbeatAt: s.heartbeatAt },
    analysis: {
      status: s.analysisStatus,
      error: s.analysisStatus === 'error' ? parseJson<{ error?: string }>(s.analysisResult, {}).error ?? null : null,
      ...(s.contract
        ? {
            commitSha: s.contract.commitSha,
            extractedAt: s.contract.extractedAt,
            endpoints: parseJson<unknown[]>(s.contract.endpoints, []).length,
            outboundDependencies: parseJson<unknown[]>(s.contract.outboundDeps, []).length,
          }
        : {}),
    },
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
