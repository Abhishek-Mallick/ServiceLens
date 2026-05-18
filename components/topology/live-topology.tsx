'use client';
import { useEffect, useState } from 'react';
import { Radio, Zap } from 'lucide-react';
import { TopologyView } from './topology-view';
import type { TopologyGraph } from '@/lib/types';
import { useArchitectureEvents } from '@/lib/hooks/use-architecture-events';

interface ServiceSummary {
  id: string;
  name: string;
  framework: string | null;
  language: string | null;
  summary: string | null;
  healthStatus: string;
  producesEvents: unknown[];
  consumesEvents: unknown[];
  exposesApis: unknown[];
  consumesApis: unknown[];
  databases: unknown[];
}

// Wraps TopologyView with realtime — every `health` / `chaos` event flashes
// the corresponding service node for ~2.5s.
export function LiveTopology({
  architectureId,
  graph,
  services: initialServices,
}: {
  architectureId: string;
  graph: TopologyGraph;
  services: ServiceSummary[];
}) {
  const [services, setServices] = useState<ServiceSummary[]>(initialServices);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [lastChaos, setLastChaos] = useState<{ name: string; action: string } | null>(null);

  useArchitectureEvents(architectureId, (ev) => {
    if (ev.kind === 'hello') { setLive(true); return; }
    if (ev.kind === 'health') {
      const { serviceId, status } = ev.payload as { serviceId: string; status: string };
      setServices((prev) => prev.map((s) => s.id === serviceId ? { ...s, healthStatus: status } : s));
      flash(serviceId);
    } else if (ev.kind === 'chaos') {
      const { serviceId, name, action } = ev.payload as { serviceId: string; name: string; action: string };
      flash(serviceId);
      setLastChaos({ name, action });
      setTimeout(() => setLastChaos(null), 4000);
    } else if (ev.kind === 'incident_opened') {
      const { serviceId } = ev.payload as { serviceId: string | null };
      if (serviceId) flash(serviceId);
    }
  });

  function flash(serviceId: string) {
    setActive((prev) => {
      const next = new Set(prev); next.add(serviceId); return next;
    });
    setTimeout(() => {
      setActive((prev) => {
        const next = new Set(prev); next.delete(serviceId); return next;
      });
    }, 2500);
  }

  return (
    <div className="relative h-full w-full">
      <TopologyView architectureId={architectureId} graph={graph} services={services} activeServiceIds={active} />
      <div className="pointer-events-none absolute right-4 top-4 z-30 flex flex-col items-end gap-1">
        {live && (
          <span className="rounded-full border border-white/[0.14] bg-canvas/80 backdrop-blur px-2 py-0.5 text-[10px] text-accent-green inline-flex items-center gap-1">
            <Radio className="h-2.5 w-2.5 animate-pulse" /> live
          </span>
        )}
        {lastChaos && (
          <span className="rounded-full border border-accent-orange/40 bg-canvas/80 backdrop-blur px-2 py-0.5 text-[10px] text-accent-orange inline-flex items-center gap-1">
            <Zap className="h-2.5 w-2.5" /> {lastChaos.action} → {lastChaos.name}
          </span>
        )}
      </div>
    </div>
  );
}
