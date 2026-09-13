'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, Loader2, Plus, Trash2, X } from 'lucide-react';

interface ServiceRow {
  key: number;
  name: string;
  repoUrl: string;
  branch: string;
  deployedUrl: string;
  healthPath: string;
}

type Phase = 'idle' | 'creating' | 'registering' | 'analyzing';

let rowKey = 0;
const emptyRow = (): ServiceRow => ({ key: ++rowKey, name: '', repoUrl: '', branch: 'main', deployedUrl: '', healthPath: '/health' });

// Derive a service name from its repo URL so users don't type it twice.
function nameFromRepo(url: string): string {
  const m = url.trim().match(/github\.com\/[^/]+\/([^/?#]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : '';
}

export default function NewArchitecturePage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<ServiceRow[]>([emptyRow()]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [done, setDone] = useState<Set<number>>(new Set());

  const filled = rows.filter((r) => r.repoUrl.trim());
  const busy = phase !== 'idle';

  function update(key: number, patch: Partial<ServiceRow>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Auto-fill the name from the repo until the user types their own.
        if (patch.repoUrl !== undefined && (!r.name || r.name === nameFromRepo(r.repoUrl))) {
          next.name = nameFromRepo(patch.repoUrl);
        }
        return next;
      })
    );
  }

  async function submit() {
    setRowErrors({});
    setPhase('creating');
    const res = await fetch('/api/architectures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      setPhase('idle');
      toast.error('Could not create architecture');
      return;
    }
    const { architecture } = await res.json();

    if (filled.length === 0) {
      toast.success('Architecture created — add services to start monitoring.');
      router.push(`/architectures/${architecture.id}`);
      return;
    }

    setPhase('registering');
    const errors: Record<number, string> = {};
    const ok = new Set<number>();
    for (const r of filled) {
      const sres = await fetch(`/api/architectures/${architecture.id}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: r.name.trim() || nameFromRepo(r.repoUrl),
          repoUrl: r.repoUrl.trim(),
          branch: r.branch.trim() || 'main',
          deployedUrl: r.deployedUrl.trim() || null,
          healthPath: r.healthPath.trim() || '/health',
        }),
      });
      if (sres.ok) ok.add(r.key);
      else {
        const body = await sres.json().catch(() => ({}));
        const fieldErrors = body?.details?.fieldErrors as Record<string, string[]> | undefined;
        errors[r.key] = fieldErrors ? Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ') : body?.error ?? 'failed';
      }
      setDone(new Set(ok));
    }
    setRowErrors(errors);

    if (ok.size > 0) {
      setPhase('analyzing');
      const ares = await fetch(`/api/architectures/${architecture.id}/analyze`, { method: 'POST' });
      const summary = await ares.json().catch(() => null);
      if (summary?.failed?.length) toast.warning(`${summary.failed.length} repo(s) could not be analyzed — see the Services tab.`);
      else {
        const n = summary?.analyzed ?? ok.size;
        const e = summary?.edges ?? 0;
        toast.success(`Analyzed ${n} service${n === 1 ? '' : 's'} · ${e} ${e === 1 ? 'dependency' : 'dependencies'} found`);
      }
    }
    if (Object.keys(errors).length > 0) toast.error('Some services were not registered — fix them from the architecture page.');
    router.push(`/architectures/${architecture.id}`);
  }

  return (
    <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto">
      <Link href="/architectures" className="text-[11px] uppercase tracking-[0.2em] text-ash inline-flex items-center gap-1 mb-6 hover:text-ink">
        <ArrowLeft className="h-3 w-3" /> Architectures
      </Link>

      <div className="mb-2 text-[11px] uppercase tracking-[0.25em] text-ash">Step {step} of 2</div>
      <h1 className="font-display text-[44px] leading-[1.05] tracking-tight text-ink mb-2">
        {step === 1 ? 'Name your mesh.' : 'Register your services.'}
      </h1>
      <p className="text-mute text-[14px] max-w-xl mb-8">
        {step === 1
          ? 'An architecture groups the services you want to monitor together.'
          : 'Add each service’s GitHub repo and where it runs. We read the repo to map dependencies, probe the deployed URL every minute, and open incidents when it breaks.'}
      </p>

      {step === 1 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Checkout platform" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="What does this mesh power?" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" asChild><Link href="/architectures">Cancel</Link></Button>
              <Button onClick={() => setStep(2)} disabled={!name.trim()}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <Card key={r.key}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-ash flex items-center gap-2">
                      Service {i + 1}
                      {done.has(r.key) && <Check className="h-3.5 w-3.5 text-accent-green" />}
                      {rowErrors[r.key] && <X className="h-3.5 w-3.5 text-accent-red" />}
                    </div>
                    {rows.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove service ${i + 1}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`repo-${r.key}`}>GitHub repo</Label>
                      <Input id={`repo-${r.key}`} placeholder="https://github.com/acme/orders" value={r.repoUrl} onChange={(e) => update(r.key, { repoUrl: e.target.value })} disabled={busy} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`name-${r.key}`}>Service name</Label>
                      <Input id={`name-${r.key}`} placeholder="orders" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} disabled={busy} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`url-${r.key}`}>Deployed URL</Label>
                      <Input id={`url-${r.key}`} placeholder="https://orders.acme.com" value={r.deployedUrl} onChange={(e) => update(r.key, { deployedUrl: e.target.value })} disabled={busy} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`health-${r.key}`}>Health path</Label>
                        <Input id={`health-${r.key}`} value={r.healthPath} onChange={(e) => update(r.key, { healthPath: e.target.value })} disabled={busy} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`branch-${r.key}`}>Branch</Label>
                        <Input id={`branch-${r.key}`} value={r.branch} onChange={(e) => update(r.key, { branch: e.target.value })} disabled={busy} />
                      </div>
                    </div>
                  </div>
                  {rowErrors[r.key] && <p className="text-[12px] text-accent-red">{rowErrors[r.key]}</p>}
                  {!r.deployedUrl.trim() && r.repoUrl.trim() && (
                    <p className="text-[12px] text-ash">Without a deployed URL this service is mapped but not health-checked.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            <Plus className="h-3.5 w-3.5" /> Add another service
          </Button>

          <div className="flex items-center justify-between gap-2 mt-8">
            <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>Back</Button>
            <div className="flex items-center gap-3">
              {busy && (
                <span className="text-[12px] text-mute">
                  {phase === 'creating' && 'Creating architecture…'}
                  {phase === 'registering' && `Registering services (${done.size}/${filled.length})…`}
                  {phase === 'analyzing' && 'Reading repos and mapping dependencies…'}
                </span>
              )}
              <Button onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : filled.length ? `Create & analyze ${filled.length} service${filled.length === 1 ? '' : 's'}` : 'Create architecture'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
