import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { isSlackWebhookUrl } from '@/lib/notify/channels/slack';
import { decryptSecret, encryptSecret, maskWebhook } from '@/lib/secrets';

const Input = z.object({
  slackWebhookUrl: z.string().url().nullable().or(z.literal('')).optional(),
  notificationsEmail: z.string().email().nullable().or(z.literal('')).optional(),
  autoFixPr: z.boolean().optional(),
  contractTestIntervalMin: z
    .number()
    .int()
    .refine((v) => [0, 60, 360, 1440].includes(v), 'must be 0 (off), 60, 360 or 1440')
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  if (body.slackWebhookUrl && !isSlackWebhookUrl(body.slackWebhookUrl)) {
    return NextResponse.json({ error: 'Slack webhook must be an https://hooks.slack.com/… incoming-webhook URL' }, { status: 400 });
  }
  const updated = await prisma.architecture.update({
    where: { id: params.id },
    data: {
      // Webhook URLs are bearer secrets: stored encrypted, never sent back in full.
      slackWebhookUrl: body.slackWebhookUrl === undefined ? undefined : body.slackWebhookUrl ? encryptSecret(body.slackWebhookUrl) : null,
      notificationsEmail: body.notificationsEmail === '' ? null : body.notificationsEmail ?? undefined,
      autoFixPr: body.autoFixPr,
      contractTestIntervalMin: body.contractTestIntervalMin,
    },
  });
  return NextResponse.json({
    architecture: {
      id: updated.id,
      slackConfigured: !!updated.slackWebhookUrl,
      slackMasked: maskWebhook(decryptSecret(updated.slackWebhookUrl)),
      notificationsEmail: updated.notificationsEmail,
      autoFixPr: updated.autoFixPr,
      contractTestIntervalMin: updated.contractTestIntervalMin,
    },
  });
}
