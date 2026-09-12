import { prisma } from '@/lib/prisma';
import { stringify, parseJson } from '@/lib/utils';
import type { ChannelKind, NotificationChannel, NotificationMessage, Severity } from './types';
import { inappChannel } from './channels/inapp';
import { slackChannel } from './channels/slack';
import { consoleChannel } from './channels/console';
import { signAckToken } from './tokens';
import { decryptSecret } from '@/lib/secrets';

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

// ─────────────────────────────────────────────────────────────────────────────
// Recipient resolution (pure — see tests/notify-recipients.test.ts)
//
//   in-app : every member (demo architectures: owner only, so the shared
//            showcase doesn't flood every signup's bell)
//   email  : editors/owners + the architecture alias, each filtered by their
//            own severity / quiet-hours / email prefs — only when the rule asks
//            for email. The on-call engineer from the roster is always emailed
//            for Opened/Escalated (paging is the point of the directory), plus
//            the escalation contact on Escalated.
//   slack  : the architecture webhook, gated by the owner's prefs
// ─────────────────────────────────────────────────────────────────────────────
export interface MemberInfo {
  userId: string;
  email: string | null;
  role: string;
  pref: { emailEnabled: boolean; slackEnabled: boolean; minSeverity: string; quietHoursStart: number | null; quietHoursEnd: number | null } | null;
}

export interface RecipientInput {
  demo: boolean;
  ownerId: string;
  notificationsEmail: string | null;
  slackWebhookUrl: string | null;
  members: MemberInfo[];
  oncall: { name: string; email: string; escalationEmail: string | null } | null;
  template: NotificationMessage['template'];
  severity: Severity;
  requested: ChannelKind[];
  nowUtcHour: number;
}

export interface ResolvedRecipients {
  userIds: string[];
  emails: Array<{ email: string; userId: string | null }>;
  slackWebhookUrl: string | null;
}

function prefAllows(pref: MemberInfo['pref'], severity: Severity, hour: number, kind: 'email' | 'slack'): boolean {
  if (!pref) return true;
  if (kind === 'email' && !pref.emailEnabled) return false;
  if (kind === 'slack' && !pref.slackEnabled) return false;
  if (SEVERITY_RANK[severity] < SEVERITY_RANK[(pref.minSeverity as Severity) ?? 'info']) return false;
  if (pref.quietHoursStart != null && pref.quietHoursEnd != null) {
    const { quietHoursStart: a, quietHoursEnd: b } = pref;
    const quiet = a <= b ? hour >= a && hour < b : hour >= a || hour < b;
    if (quiet) return false;
  }
  return true;
}

export function resolveRecipients(input: RecipientInput): ResolvedRecipients {
  const owner = input.members.find((m) => m.userId === input.ownerId) ?? { userId: input.ownerId, email: null, role: 'owner', pref: null };
  const audience = input.demo ? [owner] : input.members;

  const userIds = Array.from(new Set(audience.map((m) => m.userId)));

  const emails = new Map<string, string | null>(); // email → userId
  const add = (email: string | null | undefined, userId: string | null) => {
    if (!email) return;
    const key = email.trim().toLowerCase();
    if (!emails.has(key)) emails.set(key, userId);
  };

  if (input.requested.includes('email')) {
    for (const m of audience) {
      if (m.role !== 'owner' && m.role !== 'editor') continue;
      if (!prefAllows(m.pref, input.severity, input.nowUtcHour, 'email')) continue;
      add(m.email, m.userId);
    }
    if (input.notificationsEmail && prefAllows(owner.pref, input.severity, input.nowUtcHour, 'email')) add(input.notificationsEmail, null);
  }

  if (input.oncall && !input.demo) {
    const match = input.members.find((m) => m.email?.toLowerCase() === input.oncall!.email.toLowerCase());
    if (input.template === 'IncidentOpened' || input.template === 'IncidentEscalated') add(input.oncall.email, match?.userId ?? null);
    if (input.template === 'IncidentEscalated') add(input.oncall.escalationEmail, null);
    // Keep the paged engineer in the loop on ack/resolve when email is on.
    if ((input.template === 'IncidentAcknowledged' || input.template === 'IncidentResolved' || input.template === 'FixPRReady') && input.requested.includes('email')) {
      add(input.oncall.email, match?.userId ?? null);
    }
  }

  const slack =
    input.requested.includes('slack') && input.slackWebhookUrl && prefAllows(owner.pref, input.severity, input.nowUtcHour, 'slack')
      ? input.slackWebhookUrl
      : null;

  return { userIds, emails: Array.from(emails, ([email, userId]) => ({ email, userId })), slackWebhookUrl: slack };
}

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
      demo: true,
      userId: true,
      slackWebhookUrl: true,
      notificationsEmail: true,
      members: {
        select: {
          role: true,
          user: { select: { id: true, email: true, notificationPref: true } },
        },
      },
      user: { select: { id: true, email: true, notificationPref: true } },
    },
  });
  if (!arch) return;

  const incident = input.incidentId
    ? await prisma.incident.findUnique({
        where: { id: input.incidentId },
        include: { service: { select: { name: true } }, oncall: true },
      })
    : null;

  const members: MemberInfo[] = arch.members.map((m) => ({ userId: m.user.id, email: m.user.email, role: m.role, pref: m.user.notificationPref }));
  if (!members.some((m) => m.userId === arch.userId)) {
    members.push({ userId: arch.user.id, email: arch.user.email, role: 'owner', pref: arch.user.notificationPref });
  }

  const resolved = resolveRecipients({
    demo: arch.demo,
    ownerId: arch.userId,
    notificationsEmail: arch.notificationsEmail,
    slackWebhookUrl: decryptSecret(arch.slackWebhookUrl),
    members,
    oncall: incident?.oncall ? { name: incident.oncall.name, email: incident.oncall.email, escalationEmail: incident.oncall.escalationEmail } : null,
    template: input.template,
    severity: input.severity,
    requested: input.channels,
    nowUtcHour: new Date().getUTCHours(),
  });

  const ackTokens: Record<string, string> = {};
  if (input.incidentId) {
    for (const r of resolved.emails) ackTokens[r.email] = signAckToken(input.incidentId, r.userId, r.userId ? null : r.email);
  }
  const absHref = input.href.startsWith('http') ? input.href : `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${input.href}`;

  const msg: NotificationMessage = {
    template: input.template,
    title: input.title,
    body: input.body,
    severity: input.severity,
    href: absHref,
    recipients: {
      userIds: resolved.userIds,
      emails: resolved.emails.map((r) => r.email),
      ackTokens,
      slackWebhookUrl: resolved.slackWebhookUrl,
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
    ackToken: input.incidentId ? signAckToken(input.incidentId, arch.userId) : undefined,
    oncall: incident?.oncall ? { name: incident.oncall.name, email: incident.oncall.email } : null,
  };

  const ordered: ChannelKind[] = ['inapp'];
  if (msg.recipients.emails.length > 0) ordered.push('email');
  if (msg.recipients.slackWebhookUrl) ordered.push('slack');
  ordered.push('console');

  for (const kind of ordered) {
    const ch = await getChannel(kind);
    if (!ch || !ch.available()) {
      await prisma.notificationLog.create({
        data: {
          incidentId: input.incidentId ?? null,
          channel: kind,
          status: 'skipped',
          template: input.template,
          error: kind === 'email' ? 'RESEND_API_KEY not configured' : 'channel unavailable',
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
        payload: stringify({ template: input.template, channels: ordered, emails: msg.recipients.emails.length, inapp: msg.recipients.userIds.length }),
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
