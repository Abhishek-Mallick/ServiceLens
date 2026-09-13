import * as React from 'react';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { IncidentEmail } from '../emails/incident-email';
import type { NotificationChannel, NotificationMessage, DeliveryResult } from '../types';

let cached: Resend | null = null;
function client(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

export const emailChannel: NotificationChannel = {
  kind: 'email',
  available: () => !!process.env.RESEND_API_KEY,
  async send(msg: NotificationMessage): Promise<DeliveryResult[]> {
    const recipients = msg.recipients.emails.filter((e) => !!e);
    if (recipients.length === 0) return [];
    const sdk = client();
    if (!sdk) {
      return recipients.map((to) => ({ channel: 'email', recipient: to, ok: false, error: 'RESEND_API_KEY not configured' }));
    }
    const from = process.env.RESEND_FROM ?? 'ServiceLens <onboarding@resend.dev>';
    const canAck = msg.template === 'IncidentOpened' || msg.template === 'IncidentEscalated';
    const results: DeliveryResult[] = [];
    for (const to of recipients) {
      // Each recipient gets their own token so the ack is attributed to them.
      const token = msg.recipients.ackTokens?.[to] ?? msg.ackToken;
      const ackUrl = canAck && token
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/notify/ack?token=${encodeURIComponent(token)}`
        : null;
      const html = await render(<IncidentEmail msg={msg} ackUrl={ackUrl} />);
      try {
        const { error } = await sdk.emails.send({
          from,
          to,
          subject: msg.title,
          html,
        });
        if (error) {
          results.push({ channel: 'email', recipient: to, ok: false, error: error.message });
        } else {
          results.push({ channel: 'email', recipient: to, ok: true });
        }
      } catch (err) {
        results.push({ channel: 'email', recipient: to, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results;
  },
};
