export type ChannelKind = 'inapp' | 'email' | 'slack' | 'webhook' | 'console';
export type Severity = 'info' | 'warning' | 'critical';

export interface NotificationMessage {
  template: 'IncidentOpened' | 'IncidentAcknowledged' | 'IncidentResolved' | 'IncidentEscalated' | 'FixPRReady';
  title: string;
  body: string;
  severity: Severity;
  href: string; // absolute or app-relative URL
  // Recipient hints (channel-specific)
  recipients: {
    userIds: string[]; // in-app target
    emails: string[]; // email channel
    ackTokens?: Record<string, string>; // per-email magic-link token (email → token)
    slackWebhookUrl?: string | null; // slack channel
    webhookUrl?: string | null;
  };
  incident?: {
    id: string;
    title: string;
    severity: Severity;
    serviceName?: string | null;
    summary?: string | null;
    openedAt: Date;
    architectureName: string;
    resolution?: string | null;
  };
  // Fallback magic-link token when a recipient has no per-email token
  ackToken?: string;
  oncall?: { name: string; email: string } | null;
}

export interface DeliveryResult {
  channel: ChannelKind;
  recipient?: string;
  ok: boolean;
  error?: string;
}

export interface NotificationChannel {
  kind: ChannelKind;
  available(): boolean;
  send(msg: NotificationMessage): Promise<DeliveryResult[]>;
}
