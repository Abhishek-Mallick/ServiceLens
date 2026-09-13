'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { colors, statusColor } from '@/lib/design-tokens';

interface Run {
  id: string;
  total: number;
  passed: number;
  failed: number;
  createdAt: string;
}

export function RegressionTrendChart({ runs }: { runs: Run[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const data = runs
    .slice()
    .reverse()
    .map((r) => ({
      label: format(new Date(r.createdAt), 'MMM d HH:mm'),
      passed: r.passed,
      failed: r.failed,
    }));
  if (data.length === 0) return null;
  if (!mounted) return <div className="h-[160px]" suppressHydrationWarning />;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors['hairline-strong']} />
        <XAxis dataKey="label" stroke={colors.mute} tick={{ fontSize: 10 }} />
        <YAxis stroke={colors.mute} tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: colors['surface-elevated'],
            border: `1px solid ${colors['hairline-strong']}`,
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="passed" stackId="a" fill={statusColor.healthy} radius={[0, 0, 0, 0]} />
        <Bar dataKey="failed" stackId="a" fill={statusColor.down} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
