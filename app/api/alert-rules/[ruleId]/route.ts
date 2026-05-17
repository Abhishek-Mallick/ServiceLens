import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';
import { stringify } from '@/lib/utils';

const PatchInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  channels: z.array(z.enum(['inapp', 'email', 'slack', 'webhook'])).optional(),
  windowSec: z.number().int().min(30).max(86400).optional(),
  forDurationSec: z.number().int().min(0).max(86400).optional(),
});

async function loadOwned(ruleId: string, userId: string) {
  return prisma.alertRule.findFirst({
    where: { id: ruleId, architecture: { userId } },
  });
}

export async function PATCH(req: Request, { params }: { params: { ruleId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rule = await loadOwned(params.ruleId, session.user.id);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = PatchInput.parse(await req.json());
  const updated = await prisma.alertRule.update({
    where: { id: params.ruleId },
    data: {
      ...body,
      channels: body.channels ? stringify(body.channels) : undefined,
    },
  });
  return NextResponse.json({ rule: updated });
}

export async function DELETE(_req: Request, { params }: { params: { ruleId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rule = await loadOwned(params.ruleId, session.user.id);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.alertRule.delete({ where: { id: params.ruleId } });
  return NextResponse.json({ ok: true });
}
