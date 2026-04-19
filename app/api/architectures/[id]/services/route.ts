import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

const addSchema = z.object({
  name: z.string().min(1).max(120),
  repoUrl: z.string().url(),
  branch: z.string().default('main'),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const service = await prisma.service.create({
    data: {
      architectureId: params.id,
      name: parsed.data.name,
      repoUrl: parsed.data.repoUrl,
      branch: parsed.data.branch,
      analysisStatus: 'pending',
    },
  });
  return NextResponse.json({ service });
}
