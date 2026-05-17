import type { NotificationChannel, NotificationMessage, DeliveryResult } from '../types';

// Always-available fallback so dev environments work without any keys.
export const consoleChannel: NotificationChannel = {
  kind: 'console',
  available: () => true,
  async send(msg: NotificationMessage): Promise<DeliveryResult[]> {
    const tag = `[notify:${msg.template}]`;
    console.log(`${tag} ${msg.severity.toUpperCase()} — ${msg.title}`);
    if (msg.body) console.log(`${tag} ${msg.body}`);
    console.log(`${tag} ${msg.href}`);
    return [{ channel: 'console', ok: true }];
  },
};
