import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseJson } from '@/lib/utils';
import { buildTopology } from '@/lib/topology-builder';
import type { TopologyGraph } from '@/lib/types';
import { listFlowsForArchitecture } from '@/lib/regression-engine';
import { RegressionRunner } from '@/components/regression/regression-runner';

export const dynamic = 'force-dynamic';

export default async function RegressionPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      services: true,
      regressionRuns: { orderBy: { createdAt: 'desc' }, take: 15 },
    },
  });
  if (!architecture) notFound();

  const cached = parseJson<TopologyGraph>(architecture.topologyData, { nodes: [], edges: [] });
  const graph = cached.nodes.length ? cached : buildTopology(architecture.services).graph;
  const flows = await listFlowsForArchitecture(params.id);

  const servicesSummary = architecture.services.map((s) => ({
    id: s.id,
    name: s.name,
    framework: s.framework,
    language: s.language,
    summary: s.summary,
    healthStatus: s.healthStatus,
    producesEvents: parseJson<unknown[]>(s.producesEvents, []),
    consumesEvents: parseJson<unknown[]>(s.consumesEvents, []),
    exposesApis: parseJson<unknown[]>(s.exposesApis, []),
    consumesApis: parseJson<unknown[]>(s.consumesApis, []),
    databases: parseJson<unknown[]>(s.databases, []),
  }));

  return (
    <RegressionRunner
      architectureId={params.id}
      architectureName={architecture.name}
      graph={graph}
      services={servicesSummary}
      flows={flows}
      runs={architecture.regressionRuns.map((r) => ({
        id: r.id,
        status: r.status,
        totalSteps: r.totalSteps,
        passedSteps: r.passedSteps,
        failedSteps: r.failedSteps,
        startedAt: r.startedAt?.toISOString() ?? null,
        completedAt: r.completedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
