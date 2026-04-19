import { Handle, Position, type NodeProps } from 'reactflow';
import { Radio } from 'lucide-react';

export function BrokerNode({ data }: NodeProps) {
  const d = data as { label: string; topic?: string };
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-amber-400 !border-0" />
      <div className="rotate-45 rounded-md border border-amber-400/50 bg-amber-500/10 p-2.5 shadow-md">
        <div className="-rotate-45 flex items-center gap-1.5 min-w-[140px] justify-center">
          <Radio className="h-3 w-3 text-amber-300" />
          <span className="text-[11px] font-semibold truncate max-w-[130px]">{d.label}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-amber-400 !border-0" />
    </div>
  );
}
