import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseJson } from '@/lib/utils';
import { buildTopology } from '@/lib/topology-builder';
import type { TopologyGraph } from '@/lib/types';
import { TopologyView } from '@/components/topology/topology-view';

export const dynamic = 'force-dynamic';

export default async function TopologyPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { services: true },
  });
  if (!architecture) notFound();

  const cached = parseJson<TopologyGraph>(architecture.topologyData, { nodes: [], edges: [] });
  const graph = cached.nodes.length ? cached : buildTopology(architecture.services).graph;

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
    <div className="h-[calc(100vh-var(--header-height,16rem))] min-h-[700px]">
      <TopologyView architectureId={architecture.id} graph={graph} services={servicesSummary} />
    </div>
  );
}
