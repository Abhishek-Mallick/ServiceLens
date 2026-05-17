import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { stringify } from '@/lib/utils';

const ConditionInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status_eq'), status: z.enum(['down', 'degraded', 'healthy']) }),
  z.object({ kind: z.literal('p95_latency_gt'), thresholdMs: z.number().int().min(1) }),
  z.object({ kind: z.literal('error_rate_gt'), threshold: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('consecutive_down'), count: z.number().int().min(1).max(50) }),
  z.object({ kind: z.literal('regression_failed'), minFailed: z.number().int().min(1) }),
]);

const RuleInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  serviceId: z.string().nullable().optional(),
  condition: ConditionInput,
  windowSec: z.number().int().min(30).max(86400).optional(),
  forDurationSec: z.number().int().min(0).max(86400).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  channels: z.array(z.enum(['inapp', 'email', 'slack', 'webhook'])).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const rules = await prisma.alertRule.findMany({
    where: { architectureId: params.id },
    include: { service: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ rules });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = RuleInput.parse(await req.json());
  const rule = await prisma.alertRule.create({
    data: {
      architectureId: params.id,
      serviceId: body.serviceId ?? null,
      name: body.name,
      description: body.description ?? null,
      condition: stringify(body.condition),
      windowSec: body.windowSec ?? 300,
      forDurationSec: body.forDurationSec ?? 60,
      severity: body.severity ?? 'warning',
      channels: stringify(body.channels ?? ['inapp']),
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json({ rule }, { status: 201 });
}
