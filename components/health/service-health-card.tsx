'use client';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn, formatRelative } from '@/lib/utils';
import type { ServiceHealthData } from './health-dashboard';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface Props {
  service: ServiceHealthData;
  selected: boolean;
  onClick: () => void;
}

export function ServiceHealthCard({ service, selected, onClick }: Props) {
  const latest = service.history[service.history.length - 1];
  const uptimes = (['24', '168', '720'] as const).map((hours) => {
    const cutoff = Date.now() - Number(hours) * 60 * 60 * 1000;
    const relevant = service.history.filter((h) => new Date(h.checkedAt).getTime() > cutoff);
    if (relevant.length === 0) return { label: hours === '24' ? '24h' : hours === '168' ? '7d' : '30d', value: '—' };
    const ok = relevant.filter((h) => h.status === 'healthy').length;
    return {
      label: hours === '24' ? '24h' : hours === '168' ? '7d' : '30d',
      value: `${Math.round((ok / relevant.length) * 100)}%`,
    };
  });

  const sparkData = service.history.slice(-24).map((h) => ({ rt: h.responseTime ?? 0 }));

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition-all',
        selected ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/40'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{service.name}</div>
            <div className="text-xs text-muted-foreground truncate">{service.framework ?? service.language ?? '—'}</div>
          </div>
          <StatusBadge status={service.healthStatus} />
        </div>
        <div className="flex items-center gap-3 text-xs mb-3">
          <div>
            <div className="font-mono font-semibold">{latest?.responseTime ?? '—'}{latest?.responseTime ? 'ms' : ''}</div>
            <div className="text-muted-foreground text-[10px]">response</div>
          </div>
          {uptimes.map((u) => (
            <div key={u.label}>
              <div className="font-mono font-semibold">{u.value}</div>
              <div className="text-muted-foreground text-[10px]">{u.label} uptime</div>
            </div>
          ))}
        </div>
        <div className="h-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <YAxis hide domain={['auto', 'auto']} />
              <Line
                type="monotone"
                dataKey="rt"
                stroke={service.healthStatus === 'down' ? 'hsl(352 80% 55%)' : service.healthStatus === 'degraded' ? 'hsl(38 92% 50%)' : 'hsl(152 60% 45%)'}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[10px] text-muted-foreground mt-2">Last checked {formatRelative(service.lastHealthCheck)}</div>
      </CardContent>
    </Card>
  );
}
