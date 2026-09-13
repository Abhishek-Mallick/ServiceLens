import { describe, it, expect } from 'vitest';
import { resolveRecipients, type RecipientInput, type MemberInfo } from '@/lib/notify';

const member = (userId: string, role: string, pref: MemberInfo['pref'] = null): MemberInfo => ({ userId, email: `${userId}@acme.com`, role, pref });

const base: RecipientInput = {
  demo: false,
  ownerId: 'owner',
  notificationsEmail: null,
  slackWebhookUrl: 'https://hooks.slack.com/services/x',
  members: [member('owner', 'owner'), member('ed', 'editor'), member('view', 'viewer')],
  oncall: null,
  template: 'IncidentOpened',
  severity: 'critical',
  requested: ['inapp', 'email', 'slack'],
  nowUtcHour: 12,
};

const emails = (r: ReturnType<typeof resolveRecipients>) => r.emails.map((e) => e.email).sort();

describe('resolveRecipients', () => {
  it('in-app to every member; email to responders (owner + editors) only', () => {
    const r = resolveRecipients(base);
    expect(r.userIds.sort()).toEqual(['ed', 'owner', 'view']);
    expect(emails(r)).toEqual(['ed@acme.com', 'owner@acme.com']);
    expect(r.slackWebhookUrl).toBe(base.slackWebhookUrl);
  });

  it('no member email when the rule did not request email', () => {
    const r = resolveRecipients({ ...base, requested: ['inapp'] });
    expect(r.emails).toEqual([]);
    expect(r.slackWebhookUrl).toBeNull();
  });

  it('pages the on-call engineer even when the rule has no email channel', () => {
    const r = resolveRecipients({ ...base, requested: ['inapp'], oncall: { name: 'Alice', email: 'alice@ext.com', escalationEmail: 'lead@ext.com' } });
    expect(r.emails).toEqual([{ email: 'alice@ext.com', userId: null }]);
  });

  it('adds the escalation contact only on escalation', () => {
    const oncall = { name: 'Alice', email: 'alice@ext.com', escalationEmail: 'lead@ext.com' };
    expect(emails(resolveRecipients({ ...base, requested: [], oncall, template: 'IncidentEscalated' }))).toEqual(['alice@ext.com', 'lead@ext.com']);
    expect(emails(resolveRecipients({ ...base, requested: [], oncall, template: 'IncidentOpened' }))).toEqual(['alice@ext.com']);
  });

  it('attributes the on-call email to the matching member so the ack is a real user', () => {
    const r = resolveRecipients({ ...base, requested: [], oncall: { name: 'Ed', email: 'ED@acme.com', escalationEmail: null } });
    expect(r.emails).toEqual([{ email: 'ed@acme.com', userId: 'ed' }]);
  });

  it('respects each member’s severity and quiet-hours prefs', () => {
    const members = [
      member('owner', 'owner'),
      member('ed', 'editor', { emailEnabled: true, slackEnabled: true, minSeverity: 'critical', quietHoursStart: null, quietHoursEnd: null }),
      member('night', 'editor', { emailEnabled: true, slackEnabled: true, minSeverity: 'info', quietHoursStart: 22, quietHoursEnd: 6 }),
    ];
    expect(emails(resolveRecipients({ ...base, members, severity: 'warning', nowUtcHour: 23 }))).toEqual(['owner@acme.com']);
    expect(emails(resolveRecipients({ ...base, members, severity: 'critical', nowUtcHour: 12 }))).toEqual(['ed@acme.com', 'night@acme.com', 'owner@acme.com']);
  });

  it('demo architectures notify only the owner and never page on-call', () => {
    const r = resolveRecipients({ ...base, demo: true, oncall: { name: 'A', email: 'a@x.com', escalationEmail: null } });
    expect(r.userIds).toEqual(['owner']);
    expect(emails(r)).toEqual(['owner@acme.com']);
  });

  it('dedupes addresses case-insensitively', () => {
    const r = resolveRecipients({ ...base, notificationsEmail: 'OWNER@acme.com' });
    expect(emails(r)).toEqual(['ed@acme.com', 'owner@acme.com']);
  });
});
