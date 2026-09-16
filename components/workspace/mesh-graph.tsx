'use client';
// The one topology renderer: interactive in the workspace, read-only in
// previews, with edge highlighting for regression runs. Token-styled only.
import { memo, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionLineType,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  getSmoothStepPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';
import { Database, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, derived, edgeColor, statusColor, statusOf } from '@/lib/design-tokens';
import type { TopologyGraph } from '@/lib/types';
import { SeverityPill, StatusDot } from './status-dot';

export interface GraphService {
  id: string;
  name: string;
  framework: string | null;
  language: string | null;
  healthStatus: string;
  incidentSeverity?: string | null;
}

interface NodeData {
  label: string;
  serviceId?: string;
  framework?: string | null;
  language?: string | null;
  health: string;
  incidentSeverity?: string | null;
  selected?: boolean;
  dimmed?: boolean;
  pulse?: boolean;
}

interface EdgeData {
  type: string;
  ambiguous: boolean;
  showLabel: boolean;
  highlighted?: boolean;
  selected?: boolean;
  dimmed?: boolean;
}

export interface MeshGraphProps {
  graph: TopologyGraph;
  services: GraphService[];
  interactive?: boolean;
  selectedServiceId?: string | null;
  selectedEdgeId?: string | null;
  dimmedServiceIds?: Set<string>;
  pulseServiceIds?: Set<string>;
  highlightEdgeIds?: Set<string>;
  focus?: { serviceId: string; nonce: number } | null;
  onServiceClick?: (serviceId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  onBackgroundClick?: () => void;
}

const NODE_W = 220;
const NODE_H = 72;
const svcIdOf = (nodeId: string) => (nodeId.startsWith('svc-') ? nodeId.slice(4) : null);

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 130, edgesep: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: (p?.x ?? 0) - NODE_W / 2, y: (p?.y ?? 0) - NODE_H / 2 } };
  });
}

// ── Nodes ───────────────────────────────────────────────────────────────────
const ServiceCard = memo(function ServiceCard({ data }: NodeProps<NodeData>) {
  const s = statusOf(data.health);
  return (
    <div
      className={cn(
        'w-[220px] rounded-lg border bg-card px-3 py-2.5 transition-[opacity,border-color] duration-200',
        data.selected ? 'border-foreground' : 'border-border hover:border-foreground/80',
        data.dimmed && 'opacity-25'
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-muted" />
      <div className="flex items-center gap-2">
        <StatusDot status={data.health} pulse={data.pulse} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight text-foreground">{data.label}</div>
          <div className="truncate text-[11px] text-muted-foreground">{data.framework ?? data.language ?? '—'}</div>
        </div>
        {data.incidentSeverity && <SeverityPill severity={data.incidentSeverity} label="incident" />}
      </div>
      <div className="mt-1.5 text-[11px] capitalize" style={{ color: statusColor[s] }}>{s}</div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-muted" />
    </div>
  );
});

const InfraCard = memo(function InfraCard({ data, type }: NodeProps<NodeData>) {
  const Icon = type === 'database' ? Database : Radio;
  return (
    <div className={cn('flex w-[180px] items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2', data.dimmed && 'opacity-25')}>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-muted" />
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="truncate text-[12px] text-foreground/90">{data.label}</span>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-muted" />
    </div>
  );
});

const nodeTypes = { service: ServiceCard, database: InfraCard, broker: InfraCard };

// ── Edge ────────────────────────────────────────────────────────────────────
function MeshEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, data }: EdgeProps<EdgeData>) {
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  const d = data ?? { type: 'rest', ambiguous: false, showLabel: false };
  const stroke = edgeColor[(d.type in edgeColor ? d.type : 'rest') as keyof typeof edgeColor];
  const emphasis = d.highlighted || d.selected;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={16}
        style={{
          stroke: d.selected ? colors.foreground : stroke,
          strokeWidth: emphasis ? 2.75 : 1.5,
          opacity: d.dimmed ? 0.12 : d.ambiguous ? 0.6 : 0.9,
          strokeDasharray: d.ambiguous ? '6 4' : undefined,
        }}
      />
      {label && d.showLabel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, opacity: d.dimmed ? 0.2 : 1 }}
          >
            {label}
            {d.ambiguous ? ' ?' : ''}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { mesh: MeshEdge };

export function MeshGraph(props: MeshGraphProps) {
  return (
    <ReactFlowProvider>
      <MeshGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function MeshGraphInner({
  graph,
  services,
  interactive = false,
  selectedServiceId = null,
  selectedEdgeId = null,
  dimmedServiceIds,
  pulseServiceIds,
  highlightEdgeIds,
  focus,
  onServiceClick,
  onEdgeClick,
  onBackgroundClick,
}: MeshGraphProps) {
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const laid = useMemo(() => {
    const nodes: Node<NodeData>[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: 0, y: 0 },
      data: {
        label: n.label,
        serviceId: (n.data as { serviceId?: string }).serviceId,
        framework: (n.data as { framework?: string | null }).framework ?? null,
        language: (n.data as { language?: string | null }).language ?? null,
        health: String((n.data as { health?: string }).health ?? 'unknown'),
      },
    }));
    const edges: Edge<EdgeData>[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'mesh',
      label: e.label,
      data: { type: e.type, ambiguous: !!(e.details as { ambiguous?: boolean } | undefined)?.ambiguous, showLabel: interactive },
    }));
    return { nodes: layout(nodes, edges), edges };
  }, [graph, interactive]);

  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(laid.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeData>(laid.edges);
  useEffect(() => {
    setNodes(laid.nodes);
    setEdges(laid.edges);
  }, [laid, setNodes, setEdges]);

  // Live state → node/edge data, without re-running layout.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const sid = n.data.serviceId ?? svcIdOf(n.id);
        const s = sid ? byId.get(sid) : undefined;
        return {
          ...n,
          data: {
            ...n.data,
            label: s?.name ?? n.data.label,
            framework: s?.framework ?? n.data.framework,
            health: s?.healthStatus ?? n.data.health,
            incidentSeverity: s?.incidentSeverity ?? null,
            selected: !!sid && sid === selectedServiceId,
            dimmed: !!sid && !!dimmedServiceIds?.has(sid),
            pulse: !!sid && !!pulseServiceIds?.has(sid),
          },
        };
      })
    );
    setEdges((eds) =>
      eds.map((e) => {
        const a = svcIdOf(e.source);
        const b = svcIdOf(e.target);
        const highlighted = !!highlightEdgeIds?.has(e.id);
        return {
          ...e,
          animated: highlighted,
          data: {
            ...(e.data as EdgeData),
            highlighted,
            selected: e.id === selectedEdgeId,
            dimmed: !!((a && dimmedServiceIds?.has(a)) || (b && dimmedServiceIds?.has(b))),
          },
        };
      })
    );
  }, [byId, selectedServiceId, selectedEdgeId, dimmedServiceIds, pulseServiceIds, highlightEdgeIds, laid, setNodes, setEdges]);

  const rf = useReactFlow();
  useEffect(() => {
    if (!focus) return;
    const id = `svc-${focus.serviceId}`;
    const t = setTimeout(() => rf.fitView({ nodes: [{ id }], duration: 450, padding: 1.4, maxZoom: 1.25 }), 30);
    return () => clearTimeout(t);
  }, [focus, rf]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => {
        const sid = (node.data as NodeData).serviceId ?? svcIdOf(node.id);
        if (sid) onServiceClick?.(sid);
      }}
      onEdgeClick={(_, edge) => onEdgeClick?.(edge.id)}
      onPaneClick={() => onBackgroundClick?.()}
      nodesDraggable={interactive}
      nodesConnectable={false}
      elementsSelectable={interactive}
      zoomOnScroll={interactive}
      panOnDrag={interactive}
      preventScrolling={interactive}
      connectionLineType={ConnectionLineType.SmoothStep}
      fitView
      // Always open on the whole mesh (a monitoring overview must not hide
      // services); search and clicks zoom into a node via `focus`.
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color={colors.border} />
      {interactive && (
        <>
          <Controls
            showInteractive={false}
            className="!rounded-md !border !border-border !bg-muted [&>button]:!border-border/50 [&>button]:!bg-muted [&>button]:!fill-foreground hover:[&>button]:!bg-card"
          />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={0}
            nodeColor={(n) => (n.type === 'service' ? statusColor[statusOf((n.data as NodeData).health)] : colors.slate)}
            maskColor={derived.minimapMask}
            className="!rounded-md !border !border-border !bg-background"
          />
        </>
      )}
    </ReactFlow>
  );
}

export function GraphLegend() {
  const items: Array<[string, string]> = [['REST', edgeColor.rest], ['Event', edgeColor.event], ['gRPC', edgeColor.grpc], ['Database', edgeColor.database]];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      {items.map(([label, c]) => (
        <span key={label} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: c }} />{label}</span>
      ))}
      <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-muted-foreground" />unconfirmed</span>
    </div>
  );
}
