'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, PlayCircle, Plus, Trash2 } from 'lucide-react';
import { formatRelative } from '@/lib/utils';

export interface ProbeRow {
  id: string;
  name: string;
  type: string;
  target: string;
  intervalSec: number;
  timeoutSec: number;
  expectStatus: number | null;
  enabled: boolean;
  lastRunAt: string | null;
}

export function ProbesPanel({ serviceId, initialProbes }: { serviceId: string; initialProbes: ProbeRow[] }) {
  const router = useRouter();
  const [probes, setProbes] = useState<ProbeRow[]>(initialProbes);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'http', target: '', intervalSec: 30, timeoutSec: 5, expectStatus: 200 });

  async function refresh() {
    const r = await fetch(`/api/services/${serviceId}/probes`);
    const j = await r.json();
    setProbes(j.probes);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy('add');
    const res = await fetch(`/api/services/${serviceId}/probes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        target: form.target,
        intervalSec: Number(form.intervalSec),
        timeoutSec: Number(form.timeoutSec),
        expectStatus: form.type === 'http' ? Number(form.expectStatus) : null,
      }),
    });
    setBusy(null);
    if (!res.ok) { toast.error('Failed to add probe'); return; }
    toast.success('Probe added');
    setOpen(false);
    setForm({ name: '', type: 'http', target: '', intervalSec: 30, timeoutSec: 5, expectStatus: 200 });
    await refresh();
    router.refresh();
  }

  async function runNow(id: string) {
    setBusy(id);
    const res = await fetch(`/api/probes/${id}`, { method: 'POST' });
    setBusy(null);
    if (!res.ok) { toast.error('Probe run failed'); return; }
    const j = await res.json();
    toast.success(`${j.result.status}${j.result.responseTime != null ? ` · ${j.result.responseTime}ms` : ''}`);
    await refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const res = await fetch(`/api/probes/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) { toast.error('Delete failed'); return; }
    setProbes((p) => p.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Probes</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" />Add probe</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New probe</DialogTitle></DialogHeader>
            <form onSubmit={add} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Name</Label>
                <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HTTP /healthz" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="p-type">Type</Label>
                  <select id="p-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="http">HTTP</option>
                    <option value="tcp">TCP</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-target">Target</Label>
                  <Input id="p-target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                    placeholder={form.type === 'http' ? 'https://example.com/health' : 'host:port'} required />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Interval (s)</Label>
                  <Input type="number" min={5} max={3600} value={form.intervalSec} onChange={(e) => setForm({ ...form, intervalSec: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Timeout (s)</Label>
                  <Input type="number" min={1} max={60} value={form.timeoutSec} onChange={(e) => setForm({ ...form, timeoutSec: Number(e.target.value) })} />
                </div>
                {form.type === 'http' && (
                  <div className="space-y-1.5">
                    <Label>Expect status</Label>
                    <Input type="number" min={100} max={599} value={form.expectStatus} onChange={(e) => setForm({ ...form, expectStatus: Number(e.target.value) })} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={busy === 'add'}>{busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add probe'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {probes.length === 0 && (
          <div className="text-xs text-muted-foreground">No probes yet. Without probes, this service's health uses the simulator.</div>
        )}
        {probes.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-[11px] text-muted-foreground truncate font-mono">
                {p.type.toUpperCase()} {p.target}{p.expectStatus ? ` → ${p.expectStatus}` : ''} · every {p.intervalSec}s
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Last run: {formatRelative(p.lastRunAt)}</div>
            </div>
            <div className="flex items-center gap-1">
              {!p.enabled && <Badge variant="outline" className="text-[10px]">disabled</Badge>}
              <Button size="icon" variant="ghost" onClick={() => runNow(p.id)} disabled={busy === p.id} title="Run now">
                {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(p.id)} disabled={busy === p.id} title="Delete">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
