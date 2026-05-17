'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export function ArchitectureNotifications({
  architectureId,
  initial,
}: {
  architectureId: string;
  initial: { slackWebhookUrl: string | null; notificationsEmail: string | null };
}) {
  const [slack, setSlack] = useState(initial.slackWebhookUrl ?? '');
  const [email, setEmail] = useState(initial.notificationsEmail ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await fetch(`/api/architectures/${architectureId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slackWebhookUrl: slack, notificationsEmail: email }),
    });
    setSaving(false);
    if (!r.ok) { toast.error('Save failed'); return; }
    toast.success('Notification routing updated');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notification routing</CardTitle>
        <CardDescription>Where alerts for this architecture get delivered.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="slack-url">Slack incoming webhook URL</Label>
          <Input id="slack-url" value={slack} onChange={(e) => setSlack(e.target.value)}
            placeholder="https://hooks.slack.com/services/T0…" type="url" />
          <p className="text-[11px] text-muted-foreground">Free in Slack. Create one at <a href="https://api.slack.com/messaging/webhooks" className="underline" target="_blank" rel="noreferrer">api.slack.com/messaging/webhooks</a>.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email-to">Notifications email (overrides your account email)</Label>
          <Input id="email-to" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="oncall@yourcompany.com" />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
