'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
}

export function HealthOverviewChart({ healthy, degraded, down, unknown }: Props) {
  const data = [
    { name: 'Healthy', value: healthy, color: 'hsl(152 60% 45%)' },
    { name: 'Degraded', value: degraded, color: 'hsl(38 92% 50%)' },
    { name: 'Down', value: down, color: 'hsl(352 80% 55%)' },
    { name: 'Unknown', value: unknown, color: 'hsl(215 16% 55%)' },
  ].filter((d) => d.value > 0);

  const total = healthy + degraded + down + unknown;

  if (total === 0) {
    return <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">No services to report yet.</div>;
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
        <span className="font-semibold text-success">{healthy}</span>
        <span className="text-muted-foreground"> of {total} services healthy</span>
      </div>
    </div>
  );
}
