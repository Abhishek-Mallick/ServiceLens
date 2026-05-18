'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, Zap } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';

type Action = 'kill_service' | 'degrade' | 'latency_spike';

export interface ChaosRow {
  id: string;
  targetServiceId: string;
  schedule: string;
  action: string;
  durationSec: number;
  enabled: boolean;
  lastRunAt: string | null;
}

export interface ServiceLite { id: string; name: string }

const ACTION_LABEL: Record<string, string> = {
  kill_service: 'Kill service',
  degrade: 'Degrade',
  latency_spike: 'Latency spike',
};

export function ChaosPanel({
  architectureId,
  services,
  initialSchedules,
}: {
  architectureId: string;
  services: ServiceLite[];
  initialSchedules: ChaosRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ChaosRow[]>(initialSchedules);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    targetServiceId: services[0]?.id ?? '',
    schedule: 'every 1h',
    action: 'kill_service' as Action,
    durationSec: 300,
  });

  async function refresh() {
    const r = await fetch(`/api/architectures/${architectureId}/chaos-schedules`);
    const j = await r.json();
    setRows(j.schedules);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy('add');
    const res = await fetch(`/api/architectures/${architectureId}/chaos-schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setBusy(null);
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Add failed'); return; }
    toast.success('Schedule added');
    await refresh();
    router.refresh();
  }

  async function runNow() {
    if (!form.targetServiceId) return;
    setBusy('runNow');
    const res = await fetch(`/api/architectures/${architectureId}/chaos-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: form.targetServiceId, action: form.action, durationSec: form.durationSec }),
    });
    setBusy(null);
    if (!res.ok) { toast.error('Manual chaos failed'); return; }
    const j = await res.json();
    toast.success(j.incidentId ? 'Chaos fired — incident opened' : 'Chaos fired');
    router.refresh();
  }

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    const r = await fetch(`/api/chaos-schedules/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setBusy(null);
    if (!r.ok) { toast.error('Update failed'); return; }
    await refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const r = await fetch(`/api/chaos-schedules/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (!r.ok) { toast.error('Delete failed'); return; }
    setRows((rs) => rs.filter((x) => x.id !== id));
    router.refresh();
  }

  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? '—';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-accent-orange" /> Chaos drills</CardTitle>
        <CardDescription>
          Scheduled fault injection. The cron tick (<code className="text-[10px]">/api/cron/tick</code>) drains due drills — hook it to Vercel Cron in production. Use <em>Run now</em> to fire the configured action immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="rounded-md border border-white/[0.08] p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Target service</Label>
              <select value={form.targetServiceId} onChange={(e) => setForm({ ...form, targetServiceId: e.target.value })}
                className="h-9 w-full rounded-md border border-white/[0.14] bg-surface-card px-3 text-sm text-ink">
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Action</Label>
              <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as Action })}
                className="h-9 w-full rounded-md border border-white/[0.14] bg-surface-card px-3 text-sm text-ink">
                <option value="kill_service">Kill service</option>
                <option value="degrade">Degrade</option>
                <option value="latency_spike">Latency spike</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Schedule</Label>
              <Input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="every 1h, every 5m, or 14:00" />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (s)</Label>
              <Input type="number" min={30} max={86400} value={form.durationSec}
                onChange={(e) => setForm({ ...form, durationSec: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={busy === 'add' || !form.targetServiceId}>
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Schedule drill
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={runNow} disabled={busy === 'runNow' || !form.targetServiceId}>
              {busy === 'runNow' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Run now
            </Button>
          </div>
        </form>

        <div className="space-y-2">
          {rows.length === 0 && <div className="text-sm text-white/50">No chaos schedules yet.</div>}
          {rows.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-white/[0.08] p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{ACTION_LABEL[s.action] ?? s.action} · {serviceName(s.targetServiceId)}</div>
                <div className="text-[11px] text-white/50 mt-0.5">
                  <code className="font-mono">{s.schedule}</code> · for {s.durationSec}s · last run {formatRelative(s.lastRunAt)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={cn('text-[10px] uppercase tracking-wide', s.enabled ? 'text-accent-green' : 'text-white/40')}>
                  {s.enabled ? 'on' : 'off'}
                </span>
                <Button size="sm" variant="outline" onClick={() => toggle(s.id, s.enabled)} disabled={busy === s.id}>
                  {s.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(s.id)} disabled={busy === s.id}>
                  <Trash2 className="h-3.5 w-3.5 text-accent-red" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
