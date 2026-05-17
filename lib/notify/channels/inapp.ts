import { prisma } from '@/lib/prisma';
import type { NotificationChannel, NotificationMessage, DeliveryResult } from '../types';

export const inappChannel: NotificationChannel = {
  kind: 'inapp',
  available: () => true,
  async send(msg: NotificationMessage): Promise<DeliveryResult[]> {
    if (msg.recipients.userIds.length === 0) return [];
    const rows = await prisma.notification.createManyAndReturn({
      data: msg.recipients.userIds.map((userId) => ({
        userId,
        kind:
          msg.template === 'IncidentOpened' ? 'incident_opened' :
          msg.template === 'IncidentAcknowledged' ? 'incident_acked' :
          msg.template === 'IncidentResolved' ? 'incident_resolved' :
          'fix_pr_ready',
        title: msg.title,
        body: msg.body,
        href: msg.href,
        severity: msg.severity,
        incidentId: msg.incident?.id ?? null,
      })),
    });
    return rows.map((r) => ({ channel: 'inapp', recipient: r.userId, ok: true }));
  },
};
