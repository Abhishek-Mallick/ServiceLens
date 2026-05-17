import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-helpers';

const Input = z.object({
  emailEnabled: z.boolean().optional(),
  slackEnabled: z.boolean().optional(),
  minSeverity: z.enum(['info', 'warning', 'critical']).optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
});

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pref = await prisma.userNotificationPref.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json({
    pref: pref ?? {
      userId: session.user.id,
      emailEnabled: true,
      slackEnabled: true,
      minSeverity: 'warning',
      quietHoursStart: null,
      quietHoursEnd: null,
    },
  });
}

export async function PUT(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = Input.parse(await req.json());
  const pref = await prisma.userNotificationPref.upsert({
    where: { userId: session.user.id },
    update: body,
    create: {
      userId: session.user.id,
      emailEnabled: body.emailEnabled ?? true,
      slackEnabled: body.slackEnabled ?? true,
      minSeverity: body.minSeverity ?? 'warning',
      quietHoursStart: body.quietHoursStart ?? null,
      quietHoursEnd: body.quietHoursEnd ?? null,
    },
  });
  return NextResponse.json({ pref });
}
