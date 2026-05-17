import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';

const Input = z.object({
  slackWebhookUrl: z.string().url().nullable().or(z.literal('')).optional(),
  notificationsEmail: z.string().email().nullable().or(z.literal('')).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = Input.parse(await req.json());
  const updated = await prisma.architecture.update({
    where: { id: params.id },
    data: {
      slackWebhookUrl: body.slackWebhookUrl === '' ? null : body.slackWebhookUrl ?? undefined,
      notificationsEmail: body.notificationsEmail === '' ? null : body.notificationsEmail ?? undefined,
    },
  });
  return NextResponse.json({ architecture: { id: updated.id, slackWebhookUrl: updated.slackWebhookUrl, notificationsEmail: updated.notificationsEmail } });
}
