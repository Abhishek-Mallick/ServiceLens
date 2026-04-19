import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import { Server } from 'lucide-react';

const langBadge: Record<string, string> = {
  TypeScript: 'bg-blue-500/15 text-blue-400',
  JavaScript: 'bg-yellow-500/15 text-yellow-400',
  Python: 'bg-emerald-500/15 text-emerald-400',
  Go: 'bg-sky-500/15 text-sky-400',
  Java: 'bg-orange-500/15 text-orange-400',
  Rust: 'bg-amber-500/15 text-amber-400',
  'Node.js': 'bg-lime-500/15 text-lime-400',
};

export function ServiceNode({ data }: NodeProps) {
  const d = data as {
    label: string;
    language?: string;
    framework?: string;
    health?: string;
    summary?: string;
    __active?: boolean;
  };
  const dotColor = {
    healthy: 'bg-success',
    degraded: 'bg-warning',
    down: 'bg-destructive',
  }[d.health ?? 'unknown'] ?? 'bg-muted-foreground';

  return (
    <div
      className={cn(
        'group w-[220px] rounded-xl border bg-card px-3 py-2.5 shadow-md transition-all',
        d.__active ? 'border-primary ring-2 ring-primary/40 shadow-primary/30' : 'border-border/70 hover:border-primary/50'
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-primary !border-0" />
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Server className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">{d.label}</div>
          {d.framework && <div className="text-[10px] text-muted-foreground truncate">{d.framework}</div>}
        </div>
        <span className={cn('h-2 w-2 rounded-full', dotColor)} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {d.language && (
          <span className={cn('rounded-sm px-1.5 py-0.5 text-[10px] font-medium', langBadge[d.language] ?? 'bg-muted text-muted-foreground')}>
            {d.language}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground capitalize">{d.health ?? 'unknown'}</span>
      </div>
      {d.summary && <div className="mt-1.5 text-[10px] text-muted-foreground line-clamp-2 leading-snug">{d.summary}</div>}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-primary !border-0" />
    </div>
  );
}
