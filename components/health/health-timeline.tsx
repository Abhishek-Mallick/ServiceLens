'use client';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  EChartsAreaChart,
  type ChartConfig,
} from '@/components/evilcharts/charts/echarts-area-chart';
import type { HealthEntry } from './health-dashboard';

const chartConfig = {
  rt: {
    label: 'Response time (ms)',
    colors: {
      light: ['#2563eb'],
      dark: ['#60a5fa'],
    },
  },
} satisfies ChartConfig;

export function HealthTimeline({ history }: { history: HealthEntry[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-[220px]" suppressHydrationWarning />;

  const data = history.map((h) => ({
    t: format(new Date(h.checkedAt), 'MMM d HH:mm'),
    rt: h.responseTime ?? 0,
  }));

  return (
    <div className="h-[220px] w-full">
      <EChartsAreaChart
        data={data}
        config={chartConfig}
        className="h-full w-full"
        xDataKey="t"
      >
        <EChartsAreaChart.Grid />
        <EChartsAreaChart.XAxis dataKey="t" />
        <EChartsAreaChart.YAxis />
        <EChartsAreaChart.Tooltip />
        <EChartsAreaChart.Area dataKey="rt" variant="gradient">
          <EChartsAreaChart.Dot variant="border" />
          <EChartsAreaChart.ActiveDot variant="colored-border" />
        </EChartsAreaChart.Area>
      </EChartsAreaChart>
    </div>
  );
}
