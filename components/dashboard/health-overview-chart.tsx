'use client';
import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { statusColor } from '@/lib/design-tokens';

interface Props {
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
}

export function HealthOverviewChart({ healthy, degraded, down, unknown }: Props) {
  // Recharts SVG <Pie>/<Legend> measure layout on the client, which doesn't match
  // the server render — wait until mount before rendering to dodge hydration drift.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const data = [
    { name: 'Healthy', value: healthy, color: statusColor.healthy },
    { name: 'Degraded', value: degraded, color: statusColor.degraded },
    { name: 'Down', value: down, color: statusColor.down },
    { name: 'Unknown', value: unknown, color: statusColor.unknown },
  ].filter((d) => d.value > 0);

  const total = healthy + degraded + down + unknown;

  if (total === 0) {
    return <div className="flex h-[180px] items-center justify-center text-sm text-mute">No services to report yet.</div>;
  }

  if (!mounted) {
    return <div className="h-[180px]" suppressHydrationWarning />;
  }

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} strokeWidth={0} />
            ))}
          </Pie>
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="text-center text-sm">
        <span className="font-semibold text-accent-green">{healthy}</span>
        <span className="text-mute"> of {total} services healthy</span>
      </div>
    </div>
  );
}
