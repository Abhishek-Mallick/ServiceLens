import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { ingestService } from '@/lib/ingest/ingest-service';
import { saveContract } from '@/lib/ingest/persist';
import { stringify } from '@/lib/utils';
import { buildTopology } from '@/lib/topology-builder';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { services: true },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.architecture.update({ where: { id: params.id }, data: { status: 'analyzing' } });

  const pending = architecture.services.filter((s) => s.analysisStatus !== 'completed');
  for (const svc of pending) {
    try {
      await prisma.service.update({ where: { id: svc.id }, data: { analysisStatus: 'analyzing' } });
      const contract = await ingestService({ repoUrl: svc.repoUrl, branch: svc.branch });
      await saveContract(svc.id, contract);
    } catch (err) {
      await prisma.service.update({
        where: { id: svc.id },
        data: {
          analysisStatus: 'error',
          analysisResult: stringify({ error: err instanceof Error ? err.message : 'unknown' }),
        },
      });
    }
  }

  const services = await prisma.service.findMany({ where: { architectureId: params.id } });
  const { graph, dependencies } = buildTopology(services);

  await prisma.serviceDependency.deleteMany({
    where: { dependent: { architectureId: params.id } },
  });
  for (const d of dependencies) {
    await prisma.serviceDependency.upsert({
      where: { dependentId_dependencyId_type: { dependentId: d.dependentId, dependencyId: d.dependencyId, type: d.type } },
      update: { details: stringify(d.details) },
      create: { dependentId: d.dependentId, dependencyId: d.dependencyId, type: d.type, details: stringify(d.details) },
    });
  }

  await prisma.architecture.update({
    where: { id: params.id },
    data: { status: 'ready', topologyData: stringify(graph) },
  });

  return NextResponse.json({ ok: true, graph });
}
