'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  ConnectionLineType,
  BackgroundVariant,
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';
import { ServiceNode } from './service-node';
import { DatabaseNode } from './database-node';
import { BrokerNode } from './broker-node';
import { TopologyEdge } from './topology-edge';
import { ServiceDetailPanel } from './service-detail-panel';
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

const nodeTypes: NodeTypes = {
  service: ServiceNode,
  database: DatabaseNode,
  broker: BrokerNode,
};

const edgeTypes: EdgeTypes = {
  rest: TopologyEdge,
  event: TopologyEdge,
  grpc: TopologyEdge,
  database: TopologyEdge,
};

function layout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 140, edgesep: 30 });
  g.setDefaultEdgeLabel(() => ({}));
  const sizeFor = (t: string | undefined) => {
    if (t === 'broker') return { width: 180, height: 60 };
    if (t === 'database') return { width: 160, height: 80 };
    return { width: 240, height: 110 };
  };
  nodes.forEach((n) => g.setNode(n.id, sizeFor(n.type as string)));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const positioned = nodes.map((n) => {
    const { x, y } = g.node(n.id);
    const sz = sizeFor(n.type as string);
    return { ...n, position: { x: x - sz.width / 2, y: y - sz.height / 2 } };
  });
  return { nodes: positioned, edges };
}

export interface TopologyViewProps {
  architectureId: string;
  graph: TopologyGraph;
  services: ServiceSummary[];
  animatedEdges?: Set<string>;
  activeServiceIds?: Set<string>;
}

export function TopologyView({ architectureId, graph, services, animatedEdges, activeServiceIds }: TopologyViewProps) {
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const initial = useMemo(() => {
    const rawNodes: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: 0, y: 0 },
      data: { ...n.data, label: n.label, __active: false },
    }));
    const rawEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      label: e.label,
      data: { edgeType: e.type, details: e.details, active: false },
      style: edgeStyleFor(e.type),
      animated: false,
      interactionWidth: 15,
    }));
    return layout(rawNodes, rawEdges);
  }, [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const svcId = (n.data as { serviceId?: string })?.serviceId;
        const active = svcId ? activeServiceIds?.has(svcId) ?? false : false;
        return { ...n, data: { ...n.data, __active: active } };
      })
    );
    setEdges((eds) =>
      eds.map((e) => {
        const active = animatedEdges?.has(e.id) ?? false;
        return {
          ...e,
          animated: active,
          data: { ...(e.data || {}), active },
          style: { ...edgeStyleFor((e.data as { edgeType?: string })?.edgeType ?? 'event'), opacity: active ? 1 : 0.9, strokeWidth: active ? 3 : 2 },
        };
      })
    );
  }, [animatedEdges, activeServiceIds, setEdges, setNodes]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    const svcId = (node.data as { serviceId?: string })?.serviceId;
    if (svcId) setSelectedId(svcId);
  }, []);

  const selected = selectedId ? serviceMap.get(selectedId) ?? null : null;

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
          <Controls className="!bg-card !border-border !rounded-md !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
          <MiniMap
            nodeStrokeWidth={0}
            nodeColor={(n) => {
              if (n.type === 'broker') return 'hsl(38 92% 50%)';
              if (n.type === 'database') return 'hsl(202 80% 55%)';
              return 'hsl(239 84% 67%)';
            }}
            className="!bg-card !border-border !rounded-md"
            maskColor="hsl(var(--background) / 0.7)"
          />
        </ReactFlow>
        <TopologyLegend architectureId={architectureId} />
        <ServiceDetailPanel service={selected} onClose={() => setSelectedId(null)} />
      </div>
    </ReactFlowProvider>
  );
}

function edgeStyleFor(type: string) {
  const base = { strokeWidth: 2 };
  switch (type) {
    case 'event':
    case 'kafka':
      return { ...base, stroke: 'hsl(38 92% 50%)' };
    case 'database':
      return { ...base, stroke: 'hsl(202 80% 55%)' };
    case 'grpc':
      return { ...base, stroke: 'hsl(280 75% 60%)' };
    case 'rest':
    default:
      return { ...base, stroke: 'hsl(239 84% 67%)' };
  }
}

function TopologyLegend({ architectureId }: { architectureId: string }) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-border/60 bg-card/80 backdrop-blur px-3 py-2 text-xs shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: 'hsl(239 84% 67%)' }} /> REST</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: 'hsl(38 92% 50%)' }} /> Event</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: 'hsl(202 80% 55%)' }} /> DB</span>
      </div>
    </div>
  );
}
