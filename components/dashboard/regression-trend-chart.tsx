'use client';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  EChartsAreaChart,
  type ChartConfig,
} from '@/components/evilcharts/charts/echarts-area-chart';

interface Run {
  id: string;
  total: number;
  passed: number;
  failed: number;
  createdAt: string;
}

const chartConfig = {
  passed: {
    label: 'Passed',
    colors: {
      light: ['#047857'],
      dark: ['#10b981'],
    },
  },
  failed: {
    label: 'Failed',
    colors: {
      light: ['#be123c'],
      dark: ['#f43f5e'],
    },
  },
} satisfies ChartConfig;

export function RegressionTrendChart({ runs }: { runs: Run[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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
    <div className="h-[160px] w-full">
      <EChartsAreaChart
        data={data}
        config={chartConfig}
        className="h-full w-full"
        stackType="stacked"
        xDataKey="label"
      >
        <EChartsAreaChart.Grid />
        <EChartsAreaChart.XAxis dataKey="label" />
        <EChartsAreaChart.YAxis />
        <EChartsAreaChart.Legend />
        <EChartsAreaChart.Tooltip />
        <EChartsAreaChart.Area dataKey="passed" variant="gradient">
          <EChartsAreaChart.Dot variant="border" />
          <EChartsAreaChart.ActiveDot variant="colored-border" />
        </EChartsAreaChart.Area>
        <EChartsAreaChart.Area dataKey="failed" variant="gradient">
          <EChartsAreaChart.Dot variant="border" />
          <EChartsAreaChart.ActiveDot variant="colored-border" />
        </EChartsAreaChart.Area>
      </EChartsAreaChart>
    </div>
  );
}
