'use client';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

interface Run {
  id: string;
  total: number;
  passed: number;
  failed: number;
  createdAt: string;
}

export function RegressionTrendChart({ runs }: { runs: Run[] }) {
  const data = runs
    .slice()
    .reverse()
    .map((r) => ({
      label: format(new Date(r.createdAt), 'MMM d HH:mm'),
      passed: r.passed,
      failed: r.failed,
    }));
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="passed" stackId="a" fill="hsl(152 60% 45%)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="failed" stackId="a" fill="hsl(352 80% 55%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
