'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

// The Slack webhook URL is a bearer secret: it's stored encrypted and only a
// masked form is ever sent to the browser. Paste a new URL to replace it.
export function ArchitectureNotifications({
  architectureId,
  initial,
}: {
  architectureId: string;
  initial: { slackConfigured: boolean; slackMasked: string | null; notificationsEmail: string | null };
}) {
  const [slack, setSlack] = useState('');
  const [slackState, setSlackState] = useState({ configured: initial.slackConfigured, masked: initial.slackMasked });
  const [email, setEmail] = useState(initial.notificationsEmail ?? '');
  const [saving, setSaving] = useState(false);

  async function save(body: Record<string, unknown>, okMsg: string) {
    setSaving(true);
    const r = await fetch(`/api/architectures/${architectureId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(b?.error ?? 'Save failed'); return; }
    setSlackState({ configured: b.architecture.slackConfigured, masked: b.architecture.slackMasked });
    setSlack('');
    toast.success(okMsg);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notification routing</CardTitle>
        <CardDescription>Every member gets in-app alerts; owners and editors also get email when a rule enables it. Add a team channel or alias here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="slack-url">Slack incoming webhook URL</Label>
          {slackState.configured && (
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-emerald-400">Connected</span>
              <code className="text-muted-foreground">{slackState.masked}</code>
              <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => save({ slackWebhookUrl: '' }, 'Slack disconnected')}>Remove</Button>
            </div>
          )}
          <Input id="slack-url" value={slack} onChange={(e) => setSlack(e.target.value)} autoComplete="off"
            placeholder={slackState.configured ? 'Paste a new URL to replace' : 'https://hooks.slack.com/services/T0…'} type="url" />
          <p className="text-[11px] text-muted-foreground">Stored encrypted. Create one at <a href="https://api.slack.com/messaging/webhooks" className="underline" target="_blank" rel="noreferrer">api.slack.com/messaging/webhooks</a>.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email-to">Team email alias (optional, in addition to members)</Label>
          <Input id="email-to" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="oncall@yourcompany.com" />
        </div>
        <Button onClick={() => save({ notificationsEmail: email, ...(slack.trim() ? { slackWebhookUrl: slack.trim() } : {}) }, 'Notification routing updated')} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
