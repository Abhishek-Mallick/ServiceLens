'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopologyView } from '@/components/topology/topology-view';
import type { TopologyGraph } from '@/lib/types';

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

// React Flow needs window/measurements — render only after mount to avoid
// hydration drift on the dashboard.
export function TopologyPreview({
  architectureId,
  architectureName,
  graph,
  services,
  height = 360,
}: {
  architectureId: string;
  architectureName: string;
  graph: TopologyGraph;
  services: ServiceSummary[];
  height?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="relative rounded-lg border border-white/[0.08] bg-surface-card overflow-hidden">
      <div style={{ height }} className="relative">
        {mounted ? (
          <TopologyView architectureId={architectureId} graph={graph} services={services} />
        ) : (
          <div className="h-full" suppressHydrationWarning />
        )}
      </div>
      <Link
        href={`/architectures/${architectureId}/topology`}
        className="absolute right-3 top-3 z-20 rounded-full border border-white/[0.14] bg-canvas/80 backdrop-blur px-3 py-1 text-[11px] text-ink hover:bg-white/[0.04]"
      >
        Open {architectureName} →
      </Link>
    </div>
  );
}
