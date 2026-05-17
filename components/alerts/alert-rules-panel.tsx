'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { SeverityBadge } from '@/components/incidents/severity-badge';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { formatRelative } from '@/lib/utils';

type Kind = 'status_eq' | 'p95_latency_gt' | 'error_rate_gt' | 'consecutive_down' | 'regression_failed';

export interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  service: { id: string; name: string } | null;
  condition: string; // JSON
  windowSec: number;
  forDurationSec: number;
  severity: string;
  channels: string; // JSON
  enabled: boolean;
  updatedAt: string;
}

export interface ServiceLite { id: string; name: string }

function summarizeCondition(raw: string): string {
  try {
    const c = JSON.parse(raw);
    switch (c.kind) {
      case 'status_eq': return `status is ${c.status}`;
      case 'p95_latency_gt': return `p95 latency > ${c.thresholdMs}ms`;
      case 'error_rate_gt': return `error rate > ${Math.round(c.threshold * 100)}%`;
      case 'consecutive_down': return `${c.count} consecutive down checks`;
      case 'regression_failed': return `regression failed ≥ ${c.minFailed} steps`;
    }
  } catch { /* fall through */ }
  return raw;
}

export function AlertRulesPanel({ architectureId, services, initialRules }: { architectureId: string; services: ServiceLite[]; initialRules: RuleRow[] }) {
  const router = useRouter();
  const [rules, setRules] = useState<RuleRow[]>(initialRules);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    serviceId: '',
    severity: 'warning' as 'info' | 'warning' | 'critical',
    kind: 'status_eq' as Kind,
    status: 'down' as 'down' | 'degraded' | 'healthy',
    thresholdMs: 1000,
    errorRate: 0.2,
    count: 3,
    minFailed: 1,
    windowSec: 300,
    forDurationSec: 60,
    emailEnabled: false,
    slackEnabled: false,
  });

  async function refresh() {
    const r = await fetch(`/api/architectures/${architectureId}/alert-rules`);
    const j = await r.json();
    setRules(j.rules);
  }

  function buildCondition() {
    switch (form.kind) {
      case 'status_eq': return { kind: 'status_eq', status: form.status };
      case 'p95_latency_gt': return { kind: 'p95_latency_gt', thresholdMs: Number(form.thresholdMs) };
      case 'error_rate_gt': return { kind: 'error_rate_gt', threshold: Number(form.errorRate) };
      case 'consecutive_down': return { kind: 'consecutive_down', count: Number(form.count) };
      case 'regression_failed': return { kind: 'regression_failed', minFailed: Number(form.minFailed) };
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy('add');
    const channels: string[] = ['inapp'];
    if (form.emailEnabled) channels.push('email');
    if (form.slackEnabled) channels.push('slack');
    const res = await fetch(`/api/architectures/${architectureId}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        serviceId: form.serviceId || null,
        severity: form.severity,
        condition: buildCondition(),
        windowSec: Number(form.windowSec),
        forDurationSec: Number(form.forDurationSec),
        channels,
      }),
    });
    setBusy(null);
    if (!res.ok) { toast.error('Failed to create rule'); return; }
    toast.success('Rule created');
    setOpen(false);
    setForm({ ...form, name: '' });
    await refresh();
    router.refresh();
  }

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    const res = await fetch(`/api/alert-rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setBusy(null);
    if (!res.ok) { toast.error('Update failed'); return; }
    await refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const res = await fetch(`/api/alert-rules/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) { toast.error('Delete failed'); return; }
    setRules((r) => r.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Alert rules</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-3.5 w-3.5" />New rule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New alert rule</DialogTitle></DialogHeader>
            <form onSubmit={add} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="r-name">Rule name</Label>
                <Input id="r-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Payment down for 1 minute" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Scope (service)</Label>
                  <select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">All services</option>
                    {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as 'info' | 'warning' | 'critical' })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="critical">critical</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="status_eq">Service status equals…</option>
                  <option value="p95_latency_gt">p95 latency over window {'>'} threshold</option>
                  <option value="error_rate_gt">Error rate {'>'} threshold</option>
                  <option value="consecutive_down">N consecutive down checks</option>
                  <option value="regression_failed">Last regression run failed ≥ N steps</option>
                </select>
                {form.kind === 'status_eq' && (
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'down' | 'degraded' | 'healthy' })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-2">
                    <option value="down">down</option>
                    <option value="degraded">degraded</option>
                  </select>
                )}
                {form.kind === 'p95_latency_gt' && (
                  <Input type="number" className="mt-2" value={form.thresholdMs} min={1} onChange={(e) => setForm({ ...form, thresholdMs: Number(e.target.value) })} placeholder="Threshold ms" />
                )}
                {form.kind === 'error_rate_gt' && (
                  <Input type="number" className="mt-2" step={0.05} min={0} max={1} value={form.errorRate} onChange={(e) => setForm({ ...form, errorRate: Number(e.target.value) })} placeholder="0..1" />
                )}
                {form.kind === 'consecutive_down' && (
                  <Input type="number" className="mt-2" min={1} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} placeholder="N checks" />
                )}
                {form.kind === 'regression_failed' && (
                  <Input type="number" className="mt-2" min={1} value={form.minFailed} onChange={(e) => setForm({ ...form, minFailed: Number(e.target.value) })} placeholder="Min failed steps" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Window (s)</Label>
                  <Input type="number" min={30} value={form.windowSec} onChange={(e) => setForm({ ...form, windowSec: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>For duration (s)</Label>
                  <Input type="number" min={0} value={form.forDurationSec} onChange={(e) => setForm({ ...form, forDurationSec: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Channels (always in-app)</Label>
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.emailEnabled} onChange={(e) => setForm({ ...form, emailEnabled: e.target.checked })} />Email</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={form.slackEnabled} onChange={(e) => setForm({ ...form, slackEnabled: e.target.checked })} />Slack</label>
                </div>
                <div className="text-[10px] text-muted-foreground">Email + Slack delivery is wired in Phase 2 — until then they log to console.</div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={busy === 'add' || !form.name.trim()}>{busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create rule'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {rules.length === 0 && <div className="text-sm text-muted-foreground">No rules yet. Create one to start opening incidents automatically.</div>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={r.severity} />
                <span className="text-sm font-medium truncate">{r.name}</span>
                {!r.enabled && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">disabled</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {r.service ? r.service.name : 'all services'} · {summarizeCondition(r.condition)} · window {r.windowSec}s · for {r.forDurationSec}s
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Updated {formatRelative(r.updatedAt)}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => toggle(r.id, r.enabled)} disabled={busy === r.id}>
                {r.enabled ? 'Disable' : 'Enable'}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(r.id)} disabled={busy === r.id} title="Delete">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
