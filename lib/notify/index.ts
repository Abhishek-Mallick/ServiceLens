import { prisma } from '@/lib/prisma';
import { stringify, parseJson } from '@/lib/utils';
import type { ChannelKind, NotificationChannel, NotificationMessage, Severity } from './types';
import { inappChannel } from './channels/inapp';
import { slackChannel } from './channels/slack';
import { consoleChannel } from './channels/console';
import { signAckToken } from './tokens';

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

// Eagerly available channels. The email channel pulls in @react-email and the Resend
// SDK; loading it at import-time bloats every server bundle and (more importantly)
// drags React peer dependencies through paths Next.js doesn't expect, which can
// surface as `useContext` null errors during page render. So we lazy-load it.
const REGISTRY: Partial<Record<ChannelKind, NotificationChannel>> = {
  inapp: inappChannel,
  slack: slackChannel,
  console: consoleChannel,
};

async function getChannel(kind: ChannelKind): Promise<NotificationChannel | null> {
  if (REGISTRY[kind]) return REGISTRY[kind]!;
  if (kind === 'email') {
    // Skip the dynamic import entirely when the key isn't set — keeps Resend +
    // @react-email out of the bundle for users running in console-only mode.
    if (!process.env.RESEND_API_KEY) return null;
    const { emailChannel } = await import('./channels/email');
    REGISTRY.email = emailChannel;
    return emailChannel;
  }
  return null;
}

// Resolve the channel set, recipients, and dispatch. The `channels` arg comes
// from AlertRule.channels JSON; we always tack on `inapp` for the owner and
// `console` as a no-op telemetry sink so dev environments still see traffic.
export interface DispatchInput {
  architectureId: string;
  incidentId?: string;
  template: NotificationMessage['template'];
  title: string;
  body: string;
  severity: Severity;
  href: string; // app-relative or absolute
  channels: ChannelKind[]; // requested channels from the rule
}

export async function dispatch(input: DispatchInput): Promise<void> {
  const arch = await prisma.architecture.findUnique({
    where: { id: input.architectureId },
    select: {
      id: true,
      name: true,
      userId: true,
      slackWebhookUrl: true,
      notificationsEmail: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!arch) return;

  const incident = input.incidentId
    ? await prisma.incident.findUnique({
        where: { id: input.incidentId },
        include: { service: { select: { name: true } } },
      })
    : null;

  // Per-user preferences for the architecture owner (only recipient in v1 — multi-user is Phase 7).
  const pref = await prisma.userNotificationPref.findUnique({ where: { userId: arch.userId } });
  const minRank = SEVERITY_RANK[(pref?.minSeverity as Severity | undefined) ?? 'info'];
  const passesSeverity = SEVERITY_RANK[input.severity] >= minRank;

  const inQuietHours = (() => {
    if (pref?.quietHoursStart == null || pref?.quietHoursEnd == null) return false;
    const hour = new Date().getUTCHours();
    const start = pref.quietHoursStart;
    const end = pref.quietHoursEnd;
    return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  })();

  const ackToken = input.incidentId ? signAckToken(input.incidentId, arch.userId) : undefined;
  const absHref = input.href.startsWith('http') ? input.href : `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${input.href}`;

  const msg: NotificationMessage = {
    template: input.template,
    title: input.title,
    body: input.body,
    severity: input.severity,
    href: absHref,
    recipients: {
      userIds: [arch.userId],
      emails: passesSeverity && !inQuietHours && (pref?.emailEnabled ?? true)
        ? [arch.notificationsEmail || arch.user.email].filter((e): e is string => !!e)
        : [],
      slackWebhookUrl: passesSeverity && !inQuietHours && (pref?.slackEnabled ?? true) ? arch.slackWebhookUrl : null,
    },
    incident: incident
      ? {
          id: incident.id,
          title: incident.title,
          severity: incident.severity as Severity,
          serviceName: incident.service?.name ?? null,
          summary: incident.summary,
          openedAt: incident.openedAt,
          architectureName: arch.name,
          resolution: incident.resolution,
        }
      : undefined,
    ackToken,
  };

  // Always run inapp + console; add other requested channels gated by env/config availability.
  const ordered: ChannelKind[] = ['inapp'];
  for (const c of input.channels) {
    if (c === 'inapp' || c === 'console' || ordered.includes(c)) continue;
    if (c === 'email' && msg.recipients.emails.length === 0) continue;
    if (c === 'slack' && !msg.recipients.slackWebhookUrl) continue;
    ordered.push(c);
  }
  ordered.push('console');

  for (const kind of ordered) {
    const ch = await getChannel(kind);
    if (!ch) continue;
    if (!ch.available()) {
      await prisma.notificationLog.create({
        data: {
          incidentId: input.incidentId ?? null,
          channel: kind,
          status: 'skipped',
          template: input.template,
          error: 'channel unavailable',
        },
      });
      continue;
    }
    let results;
    try {
      results = await ch.send(msg);
    } catch (err) {
      results = [{ channel: kind, ok: false, error: err instanceof Error ? err.message : String(err) }];
    }
    for (const r of results) {
      await prisma.notificationLog.create({
        data: {
          incidentId: input.incidentId ?? null,
          channel: r.channel,
          status: r.ok ? 'sent' : 'failed',
          recipient: r.recipient ?? null,
          template: input.template,
          payload: stringify({ title: msg.title, severity: msg.severity }),
          error: r.error ?? null,
        },
      });
    }
  }

  if (input.incidentId) {
    await prisma.incidentEvent.create({
      data: {
        incidentId: input.incidentId,
        type: 'notification_sent',
        payload: stringify({ template: input.template, channels: ordered }),
      },
    });
  }
}

// Helper: parse AlertRule.channels JSON; defensive against bad data.
export function parseChannels(raw: string | null | undefined): ChannelKind[] {
  const list = parseJson<string[]>(raw, ['inapp']);
  const allowed: ChannelKind[] = ['inapp', 'email', 'slack', 'webhook', 'console'];
  return list.filter((c): c is ChannelKind => allowed.includes(c as ChannelKind));
}

export { signAckToken, verifyAckToken } from './tokens';
export type { ChannelKind, Severity, NotificationMessage } from './types';
