import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from 'reactflow';

export function TopologyEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style, data }: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
  });

  const active = (data as { active?: boolean } | undefined)?.active;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-md border border-border/60 bg-card/90 backdrop-blur px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
