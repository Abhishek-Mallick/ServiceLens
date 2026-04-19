import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

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
    },
  });
  return NextResponse.json({ architecture });
}
