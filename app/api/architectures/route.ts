import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getTemplate } from '@/lib/architecture-templates';
import { stringify } from '@/lib/utils';
import { buildTopology } from '@/lib/topology-builder';

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const architectures = await prisma.architecture.findMany({
    where: { userId: user.id },
    include: { _count: { select: { services: true, regressionRuns: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ architectures });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  templateId: z.enum(['blank', 'ecommerce', 'saas', 'streaming']).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const architecture = await prisma.architecture.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      userId: user.id,
      status: 'draft',
    },
  });

  // If a non-blank template was chosen, stamp the stub services so the user
  // lands on a non-empty topology immediately.
  const template = parsed.data.templateId ? getTemplate(parsed.data.templateId) : null;
  if (template && template.services.length > 0) {
    for (const svc of template.services) {
      await prisma.service.create({
        data: {
          architectureId: architecture.id,
          name: svc.name,
          repoUrl: svc.repoUrl,
          branch: 'main',
          language: svc.language,
          framework: svc.framework,
          summary: svc.summary,
          healthEndpoint: svc.healthEndpoint,
          analysisStatus: 'pending',
          healthStatus: 'unknown',
          simulated: true,
        },
      });
    }
    // Refresh topology with the new (still-bare) services so the empty-graph
    // doesn't flash on first load.
    const services = await prisma.service.findMany({ where: { architectureId: architecture.id } });
    const { graph } = buildTopology(services);
    await prisma.architecture.update({
      where: { id: architecture.id },
      data: { topologyData: stringify(graph), status: 'ready' },
    });
  }

  return NextResponse.json({ architecture });
}
