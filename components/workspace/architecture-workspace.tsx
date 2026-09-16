'use client';
// The architecture home: the live topology as the hero, a rail with open
// incidents / on-call / activity, and drawers for services and dependencies.
import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Radio, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AddServiceButton } from '@/components/architecture/add-service-button';
import { cn } from '@/lib/utils';
import { useArchitectureEvents } from '@/lib/hooks/use-architecture-events';
import { bestMatch, matchesFilter, type WorkspaceFilter } from '@/lib/workspace-filters';
import type { ActivityItem, WorkspaceData } from '@/lib/workspace-types';
import { GraphLegend, MeshGraph } from './mesh-graph';
import { ServiceDrawer } from './service-drawer';
import { EdgeDrawer } from './edge-drawer';
import { WorkspaceRail } from './workspace-rail';
import { StatusDot } from './status-dot';

type Selection = { kind: 'service'; id: string } | { kind: 'edge'; id: string } | null;

const FILTERS: Array<[WorkspaceFilter, string]> = [['all', 'All'], ['unhealthy', 'Unhealthy'], ['incidents', 'With incidents']];

export function ArchitectureWorkspace({ initial, canEdit, canOwn }: { initial: WorkspaceData; canEdit: boolean; canOwn: boolean }) {
  const architectureId = initial.architecture.id;
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<{ serviceId: string; nonce: number } | null>(null);
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const refetching = useRef(false);

  const refetch = useCallback(async () => {
    if (refetching.current) return;
    refetching.current = true;
    try {
      const r = await fetch(`/api/architectures/${architectureId}/workspace`);
      if (r.ok) setData(await r.json());
    } finally {
      refetching.current = false;
    }
  }, [architectureId]);

  const flash = useCallback((serviceId: string) => {
    setPulse((p) => new Set(p).add(serviceId));
    setTimeout(() => setPulse((p) => {
      const n = new Set(p);
      n.delete(serviceId);
      return n;
    }), 2500);
  }, []);

  useArchitectureEvents(architectureId, (ev) => {
    if (ev.kind === 'hello') { setLive(true); return; }
    if (ev.kind === 'health') {
      const { serviceId, status } = ev.payload as { serviceId?: string; status?: string };
      if (!serviceId || !status) return;
      setData((d) => {
        const svc = d.services.find((s) => s.id === serviceId);
        if (!svc || svc.healthStatus === status) return d;
        const item: ActivityItem = { id: `h-${serviceId}-${ev.at}`, at: new Date(ev.at).toISOString(), kind: 'health', title: `${svc.name} is ${status}` };
        const services = d.services.map((s) => (s.id === serviceId ? { ...s, healthStatus: status, lastHealthCheck: new Date(ev.at).toISOString() } : s));
        const counts = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
        for (const s of services) counts[(s.healthStatus in counts ? s.healthStatus : 'unknown') as keyof typeof counts] += 1;
        return { ...d, services, counts, activity: [item, ...d.activity].slice(0, 40) };
      });
      flash(serviceId);
      return;
    }
    if (ev.kind === 'incident_opened' || ev.kind === 'incident_updated' || ev.kind === 'incident_resolved') {
      const sid = (ev.payload as { serviceId?: string | null }).serviceId;
      if (sid) flash(sid);
      void refetch();
      return;
    }
    if (ev.kind === 'chaos') {
      const sid = (ev.payload as { serviceId?: string }).serviceId;
      if (sid) flash(sid);
    }
  });

  const graphServices = useMemo(
    () => data.services.map((s) => ({ id: s.id, name: s.name, framework: s.framework, language: s.language, healthStatus: s.healthStatus, incidentSeverity: s.openIncident?.severity ?? null })),
    [data.services]
  );
  const dimmed = useMemo(() => new Set(data.services.filter((s) => !matchesFilter(s, filter, query)).map((s) => s.id)), [data.services, filter, query]);

  const selectService = useCallback((id: string) => {
    setSelection({ kind: 'service', id });
    setFocus({ serviceId: id, nonce: Date.now() });
  }, []);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const hit = bestMatch(data.services, query);
    if (hit) selectService(hit.id);
  }

  const selectedEdge = selection?.kind === 'edge' ? data.graph.edges.find((e) => e.id === selection.id) ?? null : null;
  const empty = data.services.length === 0;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="relative flex min-h-[560px] flex-col border-r border-border/50">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-2.5">
          <div className="flex items-center gap-3 text-[12px] text-foreground/90">
            {(['healthy', 'degraded', 'down', 'unknown'] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5" title={k}>
                <StatusDot status={k} /> <span className="tabular-nums">{data.counts[k]}</span> <span className="hidden text-muted-foreground xl:inline">{k}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Filter services">
            {FILTERS.map(([f, label]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn('rounded-full border px-2.5 py-1 text-[12px] transition-colors', filter === f ? 'border-foreground bg-muted text-foreground' : 'border-border/50 text-muted-foreground hover:text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} placeholder="Find a service…" aria-label="Find a service" className="h-8 pl-8 text-[13px]" />
          </div>
          {live && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500"><Radio className="h-3 w-3 animate-pulse" /> live</span>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <h2 className="font-sans text-[36px] leading-none text-foreground">Nothing here yet.</h2>
              <p className="max-w-md text-[14px] text-muted-foreground">Register your services and ServiceLens maps how they call each other from the code, health-checks them, and pages the right person when one breaks.</p>
              {canEdit && <AddServiceButton architectureId={architectureId} />}
              <p className="text-[12px] text-muted-foreground">Onboarding many at once? Use an <Link href={`/architectures/${architectureId}/services`} className="text-blue-500 hover:underline">API key</Link> or point an agent at <code>/SKILL.md</code>.</p>
            </div>
          ) : (
            <MeshGraph
              graph={data.graph}
              services={graphServices}
              interactive
              selectedServiceId={selection?.kind === 'service' ? selection.id : null}
              selectedEdgeId={selection?.kind === 'edge' ? selection.id : null}
              dimmedServiceIds={dimmed}
              pulseServiceIds={pulse}
              focus={focus}
              onServiceClick={selectService}
              onEdgeClick={(id) => setSelection({ kind: 'edge', id })}
              onBackgroundClick={() => setSelection(null)}
            />
          )}
          {!empty && (
            <div className="pointer-events-none absolute bottom-3 left-14 z-10 rounded-md border border-border/50 bg-background px-3 py-1.5">
              <GraphLegend />
            </div>
          )}
          {selection?.kind === 'service' && (
            <ServiceDrawer architectureId={architectureId} serviceId={selection.id} onClose={() => setSelection(null)} onSelectService={selectService} />
          )}
          {selectedEdge && (
            <EdgeDrawer
              architectureId={architectureId}
              edge={selectedEdge}
              graph={data.graph}
              services={data.services}
              canEdit={canEdit}
              onClose={() => setSelection(null)}
              onChanged={refetch}
              onSelectService={selectService}
            />
          )}
        </div>
      </div>

      <WorkspaceRail
        architectureId={architectureId}
        demo={data.architecture.demo}
        canOwn={canOwn}
        incidents={data.incidents}
        oncall={data.oncall}
        activity={data.activity}
      />
    </div>
  );
}
