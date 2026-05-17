import * as React from 'react';
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from '@react-email/components';
import type { NotificationMessage } from '../types';

const palette = {
  bg: '#0a0a0c',
  card: '#101012',
  ink: '#fcfdff',
  muted: 'rgba(252,253,255,0.7)',
  hairline: 'rgba(255,255,255,0.14)',
  critical: '#ff2047',
  warning: '#ff801f',
  info: '#3b9eff',
  success: '#11ff99',
} as const;

function severityColor(sev: string) {
  if (sev === 'critical') return palette.critical;
  if (sev === 'warning') return palette.warning;
  return palette.info;
}

const card: React.CSSProperties = {
  background: palette.card,
  border: `1px solid ${palette.hairline}`,
  borderRadius: 12,
  padding: 32,
};
const button: React.CSSProperties = {
  display: 'inline-block',
  background: palette.ink,
  color: palette.bg,
  textDecoration: 'none',
  padding: '10px 18px',
  borderRadius: 8,
  fontWeight: 500,
  fontSize: 14,
};
const buttonGhost: React.CSSProperties = {
  display: 'inline-block',
  background: 'transparent',
  color: palette.ink,
  border: `1px solid ${palette.hairline}`,
  textDecoration: 'none',
  padding: '9px 17px',
  borderRadius: 8,
  fontWeight: 500,
  fontSize: 14,
  marginLeft: 8,
};

export function IncidentEmail({ msg, ackUrl }: { msg: NotificationMessage; ackUrl?: string | null }) {
  const sevColor = severityColor(msg.severity);
  return (
    <Html>
      <Head />
      <Preview>{msg.title}</Preview>
      <Body style={{ background: palette.bg, color: palette.ink, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: '40px 16px' }}>
          <Section>
            <Text style={{ margin: 0, color: palette.muted, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>ServiceLens</Text>
            <Heading as="h1" style={{ margin: '8px 0 24px', color: palette.ink, fontSize: 24, lineHeight: 1.3, fontWeight: 500 }}>
              <span style={{ color: sevColor }}>●</span>{' '}{msg.title}
            </Heading>
          </Section>

          <Section style={card}>
            {msg.body && (
              <Text style={{ margin: '0 0 16px', color: palette.muted, fontSize: 14, lineHeight: 1.5 }}>
                {msg.body}
              </Text>
            )}
            {msg.incident && (
              <div style={{ marginBottom: 20 }}>
                <Detail label="Severity" value={msg.incident.severity} valueColor={sevColor} />
                {msg.incident.serviceName && <Detail label="Service" value={msg.incident.serviceName} />}
                <Detail label="Architecture" value={msg.incident.architectureName} />
                <Detail label="Opened" value={new Date(msg.incident.openedAt).toUTCString()} />
                {msg.incident.resolution && <Detail label="Resolution" value={msg.incident.resolution} />}
              </div>
            )}
            <div>
              <Link href={msg.href} style={button}>Open incident</Link>
              {ackUrl && <Link href={ackUrl} style={buttonGhost}>Acknowledge</Link>}
            </div>
          </Section>

          <Hr style={{ borderColor: palette.hairline, margin: '32px 0' }} />
          <Text style={{ margin: 0, color: palette.muted, fontSize: 11 }}>
            You're receiving this because notifications are enabled in your ServiceLens profile. <Link href={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/settings`} style={{ color: palette.info, textDecoration: 'none' }}>Manage preferences</Link>.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function Detail({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${palette.hairline}` }}>
      <Text style={{ margin: 0, color: palette.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ margin: 0, color: valueColor ?? palette.ink, fontSize: 13, textAlign: 'right' }}>{value}</Text>
    </div>
  );
}
