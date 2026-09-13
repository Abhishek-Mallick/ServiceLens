'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GitMerge, Loader2, Undo2 } from 'lucide-react';

interface ServiceRef { id: string; name: string }
export interface DependencyReviewData {
  ambiguous: Array<{ from: ServiceRef; envVar: string; file: string | null; line: number | null; candidates: ServiceRef[] }>;
  unresolved: Array<{ from: ServiceRef; envVar: string; urlExample: string | null; file: string | null; line: number | null }>;
  decisions: Array<{ id: string; action: string; envVar: string; from: ServiceRef; to: ServiceRef | null }>;
}

const ACTION_LABEL: Record<string, string> = {
  confirm: 'confirmed →',
  reject: 'is not →',
  manual: 'linked →',
  ignore: 'external (ignored)',
};

const selectCls = 'h-8 rounded-md border border-hairline-strong bg-canvas px-2 text-[12px]';

export function DependencyReview({
  architectureId,
  canEdit,
  services,
  initial,
  serviceId,
}: {
  architectureId: string;
  canEdit: boolean;
  services: ServiceRef[];
  initial: DependencyReviewData;
  serviceId?: string; // show only items for this service
}) {
  const router = useRouter();
  const [review, setReview] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [manual, setManual] = useState({ from: serviceId ?? '', to: '' });

  const mine = <T extends { from: ServiceRef }>(xs: T[]) => (serviceId ? xs.filter((x) => x.from.id === serviceId) : xs);
  const ambiguous = mine(review.ambiguous);
  const unresolved = mine(review.unresolved);
  const decisions = mine(review.decisions);

  async function decide(key: string, body: { fromServiceId: string; toServiceId?: string | null; envVar?: string; action: string }) {
    setBusy(key);
    const r = await fetch(`/api/architectures/${architectureId}/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { toast.error(j.error ?? 'Could not save'); return; }
    setReview(j);
    toast.success('Topology updated');
    router.refresh();
  }

  async function undo(id: string) {
    setBusy(id);
    const r = await fetch(`/api/architectures/${architectureId}/edges/${id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { toast.error(j.error ?? 'Could not undo'); return; }
    setReview(j);
    router.refresh();
  }

  const where = (file: string | null, line: number | null) => (file ? <span className="font-mono text-[11px] text-mute"> · {file}{line ? `:${line}` : ''}</span> : null);
  const nothing = ambiguous.length === 0 && unresolved.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><GitMerge className="h-4 w-4" /> Dependency review</CardTitle>
        <CardDescription>
          Dependencies are read from the code: each env var a service uses to call another (e.g. <code>PAYMENTS_SERVICE_URL</code>).
          Settle the ones analysis couldn&apos;t match. Your decisions survive re-analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {nothing && <div className="text-sm text-mute">Every dependency found in the code is resolved.</div>}

        {ambiguous.length > 0 && (
          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.15em] text-accent-yellow">Ambiguous ({ambiguous.length})</div>
            {ambiguous.map((a) => {
              const key = `amb-${a.from.id}-${a.envVar}`;
              return (
                <div key={key} className="rounded-md border border-hairline p-3 space-y-2">
                  <div className="text-sm"><strong>{a.from.name}</strong> reads <code>{a.envVar}</code>{where(a.file, a.line)}. That matches more than one service:</div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {a.candidates.map((c) => (
                        <Button key={c.id} size="sm" variant="outline" disabled={busy !== null} onClick={() => decide(key, { fromServiceId: a.from.id, toServiceId: c.id, envVar: a.envVar, action: 'confirm' })}>
                          It&apos;s {c.name}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => decide(key, { fromServiceId: a.from.id, envVar: a.envVar, action: 'ignore' })}>
                        None: it&apos;s external
                      </Button>
                      {busy === key && <Loader2 className="h-4 w-4 animate-spin self-center" />}
                    </div>
                  ) : (
                    <div className="text-[12px] text-mute">Candidates: {a.candidates.map((c) => c.name).join(', ')}</div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {unresolved.length > 0 && (
          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.15em] text-mute">Not matched to a service ({unresolved.length})</div>
            {unresolved.map((u) => {
              const key = `unr-${u.from.id}-${u.envVar}`;
              const options = services.filter((s) => s.id !== u.from.id);
              return (
                <div key={key} className="rounded-md border border-hairline p-3 space-y-2">
                  <div className="text-sm">
                    <strong>{u.from.name}</strong> calls <code>{u.envVar}</code>
                    {u.urlExample && <span className="text-mute"> ({u.urlExample})</span>}
                    {where(u.file, u.line)}. No onboarded service matches it.
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select className={selectCls} value={links[key] ?? ''} onChange={(e) => setLinks({ ...links, [key]: e.target.value })} aria-label={`Service for ${u.envVar}`}>
                        <option value="">Link to a service…</option>
                        {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <Button size="sm" variant="outline" disabled={busy !== null || !links[key]} onClick={() => decide(key, { fromServiceId: u.from.id, toServiceId: links[key], envVar: u.envVar, action: 'manual' })}>
                        Link
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => decide(key, { fromServiceId: u.from.id, envVar: u.envVar, action: 'ignore' })}>
                        External, ignore
                      </Button>
                      <span className="text-[11px] text-mute">or register the missing service with <em>Add service</em>, and it will match automatically.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {canEdit && services.length > 1 && (
          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.15em] text-mute">Add a dependency by hand</div>
            <div className="flex flex-wrap items-center gap-2">
              <select className={selectCls} value={manual.from} onChange={(e) => setManual({ ...manual, from: e.target.value })} aria-label="From service">
                <option value="">From…</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span className="text-mute text-sm">calls</span>
              <select className={selectCls} value={manual.to} onChange={(e) => setManual({ ...manual, to: e.target.value })} aria-label="To service">
                <option value="">To…</option>
                {services.filter((s) => s.id !== manual.from).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={busy !== null || !manual.from || !manual.to}
                onClick={() => decide('manual', { fromServiceId: manual.from, toServiceId: manual.to, action: 'manual' })}>
                Add edge
              </Button>
            </div>
          </section>
        )}

        {decisions.length > 0 && (
          <section className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-[0.15em] text-mute">Decisions</div>
            {decisions.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 text-[12px] rounded-md border border-hairline px-3 py-1.5">
                <span>
                  <strong>{d.from.name}</strong>{d.envVar && <> · <code>{d.envVar}</code></>} {ACTION_LABEL[d.action] ?? d.action} {d.to && <strong>{d.to.name}</strong>}
                </span>
                {canEdit && (
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => undo(d.id)} aria-label="Undo decision">
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </Button>
                )}
              </div>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
