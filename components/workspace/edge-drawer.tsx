'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, ExternalLink, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TopologyEdge, TopologyGraph } from '@/lib/types';
import type { WorkspaceService } from '@/lib/workspace-types';
import { StatusDot } from './status-dot';

const HOW: Record<string, string> = {
  contract: 'Matched automatically: the env var in the code names this service.',
  confirmed: 'Confirmed by a teammate.',
  manual: 'Added by hand.',
};

interface Details { envVar?: string; file?: string; line?: number; matchedBy?: string; ambiguous?: boolean; topic?: string; eventName?: string }

export function EdgeDrawer({
  architectureId,
  edge,
  graph,
  services,
  canEdit,
  onClose,
  onChanged,
  onSelectService,
}: {
  architectureId: string;
  edge: TopologyEdge;
  graph: TopologyGraph;
  services: WorkspaceService[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onSelectService: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const byId = new Map(services.map((s) => [s.id, s]));
  const fromId = edge.source.replace(/^svc-/, '');
  const toId = edge.target.replace(/^svc-/, '');
  const from = byId.get(fromId);
  const to = byId.get(toId);
  const d = (edge.details ?? {}) as Details;
  const codeLink = from?.repoUrl && from.commitSha && d.file ? `${from.repoUrl.replace(/\.git$/, '')}/blob/${from.commitSha}/${d.file}${d.line ? `#L${d.line}` : ''}` : null;
  const candidates = d.ambiguous
    ? graph.edges
        .filter((e) => e.source === edge.source && (e.details as Details | undefined)?.envVar === d.envVar)
        .map((e) => byId.get(e.target.replace(/^svc-/, '')))
        .filter((s): s is WorkspaceService => !!s)
    : [];
  const editable = canEdit && !!from && !!to && (d.matchedBy === 'contract' || d.matchedBy === 'confirmed' || d.matchedBy === 'manual');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    const r = await fetch(`/api/architectures/${architectureId}/edges`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(j.error ?? 'Could not update the topology'); return; }
    toast.success(ok);
    await onChanged();
    onClose();
  }

  async function removeManual() {
    setBusy(true);
    const review = await fetch(`/api/architectures/${architectureId}/edges`).then((r) => r.json()).catch(() => null);
    const decision = (review?.decisions ?? []).find(
      (x: { id: string; action: string; envVar: string; from: { id: string }; to: { id: string } | null }) =>
        x.action === 'manual' && x.from.id === fromId && x.to?.id === toId && x.envVar === (d.envVar ?? '')
    );
    if (!decision) { setBusy(false); toast.error('Could not find that decision'); return; }
    const r = await fetch(`/api/architectures/${architectureId}/edges/${decision.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { toast.error('Could not remove the edge'); return; }
    toast.success('Edge removed');
    await onChanged();
    onClose();
  }

  const endpoint = (s: WorkspaceService | undefined, fallback: string) => (
    <button type="button" disabled={!s} onClick={() => s && onSelectService(s.id)} className="flex min-w-0 items-center gap-1.5 text-left disabled:cursor-default">
      {s && <StatusDot status={s.healthStatus} />}
      <span className="truncate text-[14px] text-foreground">{s?.name ?? fallback}</span>
    </button>
  );

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[380px] flex-col border-l border-border bg-muted" aria-label="Dependency details">
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {endpoint(from, edge.source)}
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {endpoint(to, edge.target)}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close dependency details"><X className="h-4 w-4" /></Button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13px]">
        <div className="grid grid-cols-[88px_1fr] gap-y-2">
          <span className="text-muted-foreground">Type</span><span className="uppercase tracking-wide text-foreground/90">{edge.type}</span>
          {d.envVar && (<><span className="text-muted-foreground">Env var</span><code className="text-foreground/90">{d.envVar}</code></>)}
          {(d.topic || d.eventName) && (<><span className="text-muted-foreground">Event</span><span className="text-foreground/90">{d.eventName ?? ''}{d.topic ? ` · ${d.topic}` : ''}</span></>)}
          {d.file && (
            <>
              <span className="text-muted-foreground">In code</span>
              {codeLink ? (
                <a href={codeLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[12px] text-blue-500 hover:underline">{d.file}{d.line ? `:${d.line}` : ''} <ExternalLink className="h-3 w-3" /></a>
              ) : (
                <span className="font-mono text-[12px] text-foreground/90">{d.file}{d.line ? `:${d.line}` : ''}</span>
              )}
            </>
          )}
        </div>

        {d.matchedBy && !d.ambiguous && <p className="text-muted-foreground">{HOW[d.matchedBy] ?? ''}</p>}

        {d.ambiguous && (
          <div className="space-y-2 rounded-md border border-border bg-card p-3">
            <p className="text-foreground/90"><code>{d.envVar}</code> matches more than one service, so this edge isn&apos;t confirmed yet.</p>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                {candidates.map((c) => (
                  <Button key={c.id} size="sm" variant="outline" disabled={busy} onClick={() => post({ fromServiceId: fromId, toServiceId: c.id, envVar: d.envVar, action: 'confirm' }, `Confirmed ${c.name}`)}>
                    It&apos;s {c.name}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">An editor can confirm the right one.</p>
            )}
          </div>
        )}

        {editable && !d.ambiguous && (
          <div className="border-t border-border/50 pt-3">
            {d.matchedBy === 'manual' ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={removeManual}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Remove this edge
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => post({ fromServiceId: fromId, toServiceId: toId, envVar: d.envVar, action: 'reject' }, 'Marked as wrong')}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} This match is wrong
              </Button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
