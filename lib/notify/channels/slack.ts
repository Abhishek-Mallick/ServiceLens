import type { NotificationChannel, NotificationMessage, DeliveryResult } from '../types';

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ff2047',
  warning: '#ff801f',
  info: '#3b9eff',
};

function buildBlocks(msg: NotificationMessage) {
  const color = SEVERITY_COLOR[msg.severity] ?? SEVERITY_COLOR.info;
  const fields = [];
  if (msg.incident?.serviceName) {
    fields.push({ type: 'mrkdwn', text: `*Service*\n${msg.incident.serviceName}` });
  }
  fields.push({ type: 'mrkdwn', text: `*Severity*\n${msg.severity}` });
  if (msg.incident?.architectureName) {
    fields.push({ type: 'mrkdwn', text: `*Architecture*\n${msg.incident.architectureName}` });
  }
  return {
    attachments: [
      {
        color,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: msg.title.slice(0, 150) } },
          ...(msg.body ? [{ type: 'section', text: { type: 'mrkdwn', text: msg.body.slice(0, 2900) } }] : []),
          { type: 'section', fields },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Open incident' }, url: msg.href, style: 'primary' },
              ...(msg.ackToken
                ? [{
                    type: 'button',
                    text: { type: 'plain_text', text: 'Acknowledge' },
                    url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/notify/ack?token=${encodeURIComponent(msg.ackToken)}`,
                  }]
                : []),
            ],
          },
        ],
      },
    ],
  };
}

export const slackChannel: NotificationChannel = {
  kind: 'slack',
  available: () => true, // availability is per-arch (webhook URL on the message), not env-wide
  async send(msg: NotificationMessage): Promise<DeliveryResult[]> {
    const url = msg.recipients.slackWebhookUrl;
    if (!url) return [];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBlocks(msg)),
      });
      if (!res.ok) {
        return [{ channel: 'slack', recipient: url, ok: false, error: `${res.status}: ${await res.text()}` }];
      }
      return [{ channel: 'slack', recipient: url, ok: true }];
    } catch (err) {
      return [{ channel: 'slack', recipient: url, ok: false, error: err instanceof Error ? err.message : String(err) }];
    }
  },
};
