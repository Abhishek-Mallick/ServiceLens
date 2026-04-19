import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { buildTopology } from '@/lib/topology-builder';
import { parseJson, stringify } from '@/lib/utils';
import type { TopologyGraph } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { services: true },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (architecture.topologyData) {
    const cached = parseJson<TopologyGraph>(architecture.topologyData, { nodes: [], edges: [] });
    if (cached.nodes.length) return NextResponse.json({ graph: cached });
  }

  const { graph } = buildTopology(architecture.services);
  await prisma.architecture.update({ where: { id: params.id }, data: { topologyData: stringify(graph) } });
  return NextResponse.json({ graph });
}
