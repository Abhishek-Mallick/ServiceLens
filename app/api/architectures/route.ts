import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { ensureDefaultRules } from '@/lib/monitoring/defaults';
import { listForUser } from '@/lib/membership';

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const architectures = await listForUser(user.id);
  return NextResponse.json({ architectures });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
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
      status: 'draft',
      members: { create: { userId: user.id, role: 'owner', acceptedAt: new Date() } },
    },
  });
  await ensureDefaultRules(architecture.id);

  return NextResponse.json({ architecture }, { status: 201 });
}
