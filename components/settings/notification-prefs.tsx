'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface Pref {
  emailEnabled: boolean;
  slackEnabled: boolean;
  minSeverity: 'info' | 'warning' | 'critical';
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

export function NotificationPrefs() {
  const [pref, setPref] = useState<Pref | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/me/notification-pref').then((r) => r.json()).then((j) => setPref(j.pref));
  }, []);

  async function save() {
    if (!pref) return;
    setSaving(true);
    const r = await fetch('/api/me/notification-pref', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pref),
    });
    setSaving(false);
    if (!r.ok) { toast.error('Save failed'); return; }
    toast.success('Preferences saved');
  }

  if (!pref) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Email notifications</Label>
          <p className="text-xs text-muted-foreground">Requires <code className="text-[10px]">RESEND_API_KEY</code> on the server. Free tier: 3,000/month.</p>
        </div>
        <input type="checkbox" checked={pref.emailEnabled} onChange={(e) => setPref({ ...pref, emailEnabled: e.target.checked })} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Slack notifications</Label>
          <p className="text-xs text-muted-foreground">Webhook URL is configured per architecture.</p>
        </div>
        <input type="checkbox" checked={pref.slackEnabled} onChange={(e) => setPref({ ...pref, slackEnabled: e.target.checked })} />
      </div>
      <div className="space-y-1.5">
        <Label>Minimum severity for email/Slack</Label>
        <select value={pref.minSeverity} onChange={(e) => setPref({ ...pref, minSeverity: e.target.value as 'info' | 'warning' | 'critical' })}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="info">info — every event</option>
          <option value="warning">warning — and above</option>
          <option value="critical">critical — only the loudest</option>
        </select>
        <p className="text-xs text-muted-foreground">In-app feed always receives every notification regardless of this setting.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Quiet hours start (UTC)</Label>
          <Input type="number" min={0} max={23} value={pref.quietHoursStart ?? ''} placeholder="off"
            onChange={(e) => setPref({ ...pref, quietHoursStart: e.target.value === '' ? null : Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Quiet hours end (UTC)</Label>
          <Input type="number" min={0} max={23} value={pref.quietHoursEnd ?? ''} placeholder="off"
            onChange={(e) => setPref({ ...pref, quietHoursEnd: e.target.value === '' ? null : Number(e.target.value) })} />
        </div>
      </div>
      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save preferences'}
      </Button>
    </div>
  );
}
