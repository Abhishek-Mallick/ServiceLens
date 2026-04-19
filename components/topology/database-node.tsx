import { Handle, Position, type NodeProps } from 'reactflow';
import { Database } from 'lucide-react';

export function DatabaseNode({ data }: NodeProps) {
  const d = data as { label: string; dbType?: string };
  return (
    <div className="relative w-[150px]">
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-sky-400 !border-0" />
      <div className="rounded-full border border-sky-400/50 bg-sky-500/10 px-3 py-3 shadow-md">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
            <Database className="h-3.5 w-3.5" />
          </div>
          <div className="mt-1 text-xs font-semibold truncate max-w-[120px]">{d.label}</div>
          {d.dbType && <div className="text-[10px] text-muted-foreground uppercase">{d.dbType}</div>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-sky-400 !border-0" />
    </div>
  );
}
