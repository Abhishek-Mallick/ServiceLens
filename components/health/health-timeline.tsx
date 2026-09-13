'use client';
import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { colors } from '@/lib/design-tokens';
import type { HealthEntry } from './health-dashboard';

export function HealthTimeline({ history }: { history: HealthEntry[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="h-[220px]" suppressHydrationWarning />;
  const data = history.map((h) => ({
    t: format(new Date(h.checkedAt), 'MMM d HH:mm'),
    rt: h.responseTime ?? 0,
    status: h.status,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="rtFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors['accent-blue']} stopOpacity={0.5} />
            <stop offset="95%" stopColor={colors['accent-blue']} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colors['hairline-strong']} />
        <XAxis dataKey="t" stroke={colors.mute} tick={{ fontSize: 10 }} minTickGap={40} />
        <YAxis stroke={colors.mute} tick={{ fontSize: 10 }} unit="ms" />
        <Tooltip
          contentStyle={{ background: colors['surface-elevated'], border: `1px solid ${colors['hairline-strong']}`, borderRadius: 8, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="rt" stroke={colors['accent-blue']} strokeWidth={1.5} fill="url(#rtFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
