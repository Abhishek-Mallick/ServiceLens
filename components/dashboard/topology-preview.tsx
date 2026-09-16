'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MeshGraph } from '@/components/workspace/mesh-graph';
import type { TopologyGraph } from '@/lib/types';

interface ServiceSummary {
  id: string;
  name: string;
  framework: string | null;
  language: string | null;
  healthStatus: string;
}

// Read-only preview of an architecture's mesh for the dashboard. React Flow
// needs layout measurements, so it renders only after mount.
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
  useEffect(() => setMounted(true), []);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <div className="text-[13px] text-foreground">{architectureName}</div>
        <Link href={`/architectures/${architectureId}`} className="text-[12px] text-blue-500 hover:underline">Open workspace</Link>
      </div>
      <div style={{ height }}>
        {mounted && <MeshGraph graph={graph} services={services} />}
      </div>
    </div>
  );
}
