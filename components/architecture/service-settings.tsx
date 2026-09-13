'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';

interface Settings { name: string; repoUrl: string; branch: string; deployedUrl: string | null; healthPath: string }

export function ServiceSettings({ architectureId, serviceId, initial }: { architectureId: string; serviceId: string; initial: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...initial, deployedUrl: initial.deployedUrl ?? '' });
  const [busy, setBusy] = useState<'save' | 'analyze' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify({ ...form }) !== JSON.stringify({ ...initial, deployedUrl: initial.deployedUrl ?? '' });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy('save');
    const r = await fetch(`/api/services/${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, deployedUrl: form.deployedUrl.trim() || null }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      const fe = j?.details?.fieldErrors as Record<string, string[]> | undefined;
      toast.error(fe ? Object.entries(fe).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ') : j.error ?? 'Could not save');
      return;
    }
    toast.success('Service updated');
    router.refresh();
  }

  async function reanalyze() {
    setBusy('analyze');
    const r = await fetch(`/api/architectures/${architectureId}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceIds: [serviceId] }),
    });
    const j = await r.json().catch(() => null);
    setBusy(null);
    if (!r.ok || !j) { toast.error('Analysis failed'); return; }
    if (j.failed?.length) toast.error(`Analysis failed: ${j.failed[0].error}`);
    else toast.success('Repository re-analyzed');
    router.refresh();
  }

  async function remove() {
    setBusy('delete');
    const r = await fetch(`/api/services/${serviceId}`, { method: 'DELETE' });
    setBusy(null);
    if (!r.ok) { toast.error('Could not delete'); return; }
    toast.success(`${initial.name} removed`);
    router.push(`/architectures/${architectureId}/services`);
    router.refresh();
  }

  const field = (id: keyof typeof form, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`svc-${id}`}>{label}</Label>
      <Input id={`svc-${id}`} value={form[id]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [id]: e.target.value })} disabled={busy !== null} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Service settings</CardTitle>
        <CardDescription>Changing the deployed URL or health path moves the default health check; changing the repo or branch re-reads the code.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {field('name', 'Name')}
            {field('repoUrl', 'GitHub repo', 'https://github.com/acme/orders')}
            {field('deployedUrl', 'Deployed URL', 'https://orders.acme.com')}
            <div className="grid grid-cols-2 gap-3">
              {field('healthPath', 'Health path', '/health')}
              {field('branch', 'Branch', 'main')}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" disabled={busy !== null || !dirty}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
            <Button type="button" variant="outline" onClick={reanalyze} disabled={busy !== null}>
              {busy === 'analyze' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-analyze repo
            </Button>
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-mute">Delete {initial.name}, its health history and probes?</span>
                  <Button type="button" size="sm" variant="destructive" onClick={remove} disabled={busy !== null}>
                    {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" /> Delete service</Button>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
