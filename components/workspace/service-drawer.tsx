'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ExternalLink, GitPullRequest, Loader2, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatRelative } from '@/lib/utils';
import { formatUptime } from '@/lib/workspace-filters';
import type { ServiceOverview } from '@/lib/workspace-types';
import { HealthBars } from './health-bars';
import { SeverityPill, StatusDot } from './status-dot';

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-medium text-foreground tabular-nums">{value}</div>
    </div>
  );
}

const LEVEL_CLASS: Record<string, string> = { error: 'text-red-500', warn: 'text-yellow-500' };

export function ServiceDrawer({
  architectureId,
  serviceId,
  onClose,
  onSelectService,
}: {
  architectureId: string;
  serviceId: string;
  onClose: () => void;
  onSelectService: (id: string) => void;
}) {
  const [data, setData] = useState<ServiceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/services/${serviceId}/overview`);
    if (!r.ok) {
      setError('Could not load this service.');
      return;
    }
    setData(await r.json());
  }, [serviceId]);

  useEffect(() => {
    setData(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function runProbe(id: string) {
    setRunning(id);
    const r = await fetch(`/api/probes/${id}`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setRunning(null);
    if (!r.ok) {
      toast.error(j.error ?? 'Probe failed to run');
      return;
    }
    toast.success(`${j.result.status}${j.result.responseTime != null ? ` · ${j.result.responseTime} ms` : ''}`);
    void load();
  }

  const s = data?.service;
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[400px] flex-col border-l border-border bg-muted" aria-label="Service details">
      <header className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {s && <StatusDot status={s.healthStatus} />}
            <h3 className="truncate text-[16px] font-medium text-foreground">{s?.name ?? 'Loading…'}</h3>
          </div>
          {s && (
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {s.framework ?? s.language ?? '—'} · <span className="capitalize">{s.healthStatus}</span>
              {s.lastHealthCheck && <> · checked {formatRelative(new Date(s.lastHealthCheck))}</>}
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close service details"><X className="h-4 w-4" /></Button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {error && <div className="text-[13px] text-red-500">{error}</div>}
        {!data && !error && <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading</div>}

        {data && s && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/architectures/${architectureId}/services/${s.id}`}>Open service page</Link>
              </Button>
              {s.deployedUrl && (
                <Button asChild size="sm" variant="ghost">
                  <a href={s.deployedUrl} target="_blank" rel="noreferrer">Deployed <ExternalLink className="h-3 w-3" /></a>
                </Button>
              )}
              <Button asChild size="sm" variant="ghost">
                <a href={s.repoUrl} target="_blank" rel="noreferrer">Repo <ExternalLink className="h-3 w-3" /></a>
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat label="Uptime (24h)" value={formatUptime(data.stats.uptime24h)} />
              <Stat label="p95 (1h)" value={data.stats.p95Ms != null ? `${data.stats.p95Ms} ms` : '—'} />
              <Stat label="Checks (24h)" value={String(data.stats.checks24h)} />
            </div>

            <Section title={`Last ${data.history.length} checks`}>
              <HealthBars points={data.history} />
              {s.simulated && <p className="text-[11px] text-muted-foreground">Simulated health (demo architecture).</p>}
            </Section>

            {data.incident && (
              <Section title="Open incident">
                <Link href={`/architectures/${architectureId}/incidents/${data.incident.id}`} className="block space-y-1.5 rounded-md border border-border bg-card p-3 hover:border-foreground/80">
                  <div className="flex items-center gap-2">
                    <SeverityPill severity={data.incident.severity} />
                    <span className="truncate text-[13px] text-foreground">{data.incident.title}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground capitalize">{data.incident.status} · opened {formatRelative(new Date(data.incident.openedAt))}</div>
                  {data.incident.rcaExcerpt && <p className="text-[12px] leading-relaxed text-foreground/90">{data.incident.rcaExcerpt}</p>}
                </Link>
                {data.incident.fixPrUrl && (
                  <a href={data.incident.fixPrUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-blue-500 hover:underline">
                    <GitPullRequest className="h-3.5 w-3.5" /> Draft fix PR
                  </a>
                )}
              </Section>
            )}

            {data.oncall && (
              <Section title="On call">
                <div className="text-[13px] text-foreground">{data.oncall.name} <span className="text-muted-foreground">&lt;{data.oncall.email}&gt;</span></div>
              </Section>
            )}

            <Section title={`Health checks (${data.probes.length})`}>
              {data.probes.length === 0 && <div className="text-[12px] text-muted-foreground">No probes. Set a deployed URL in the service settings to add one automatically.</div>}
              {data.probes.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5">
                  <StatusDot status={p.lastStatus ?? 'unknown'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-foreground">{p.name}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">{p.type} · {p.target}</div>
                  </div>
                  {data.canEdit && p.type !== 'heartbeat' && (
                    <Button size="sm" variant="ghost" onClick={() => runProbe(p.id)} disabled={running !== null} aria-label={`Run ${p.name} now`}>
                      {running === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              ))}
            </Section>

            <div className="grid grid-cols-2 gap-4">
              <Section title={`Calls (${data.dependsOn.length})`}>
                {data.dependsOn.length === 0 && <div className="text-[12px] text-muted-foreground">None found</div>}
                {data.dependsOn.map((d) => (
                  <button key={d.id} type="button" onClick={() => onSelectService(d.id)} className="flex w-full items-center gap-1.5 text-left hover:text-foreground">
                    <StatusDot status={d.healthStatus} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-foreground/90">{d.name}</span>
                      {d.via && <span className="block truncate font-mono text-[10px] text-muted-foreground">{d.via}</span>}
                    </span>
                  </button>
                ))}
              </Section>
              <Section title={`Called by (${data.usedBy.length})`}>
                {data.usedBy.length === 0 && <div className="text-[12px] text-muted-foreground">None found</div>}
                {data.usedBy.map((d) => (
                  <button key={d.id} type="button" onClick={() => onSelectService(d.id)} className="flex w-full items-center gap-1.5 text-left hover:text-foreground">
                    <StatusDot status={d.healthStatus} />
                    <span className="block truncate text-[12px] text-foreground/90">{d.name}</span>
                  </button>
                ))}
              </Section>
            </div>

            {data.endpoints.count > 0 && (
              <Section title={`Endpoints (${data.endpoints.count})`}>
                <div className="space-y-1">
                  {data.endpoints.sample.map((e, i) => (
                    <div key={i} className="flex gap-2 font-mono text-[11px]">
                      <span className="w-12 shrink-0 text-muted-foreground">{e.method}</span>
                      <span className="truncate text-foreground/90">{e.path}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section
              title="Warnings & errors (24h)"
              action={<Link href={`/architectures/${architectureId}/logs`} className="text-[11px] text-blue-500 hover:underline">All logs</Link>}
            >
              {data.logs.length === 0 && <div className="text-[12px] text-muted-foreground">None in the last 24 hours.</div>}
              <div className="space-y-1.5">
                {data.logs.map((l) => (
                  <div key={l.id} className="text-[11px] leading-snug">
                    <span className={cn('mr-1.5 font-mono uppercase', LEVEL_CLASS[l.level] ?? 'text-muted-foreground')}>{l.level}</span>
                    <span className="mr-1.5 text-muted-foreground">{new Date(l.at).toLocaleTimeString()}</span>
                    <span className="text-foreground/90 line-clamp-2">{l.message}</span>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
