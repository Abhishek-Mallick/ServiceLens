'use client';
import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
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
            <stop offset="5%" stopColor="hsl(239 84% 67%)" stopOpacity={0.5} />
            <stop offset="95%" stopColor="hsl(239 84% 67%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis dataKey="t" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} minTickGap={40} />
        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} unit="ms" />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="rt" stroke="hsl(239 84% 67%)" strokeWidth={1.5} fill="url(#rtFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
