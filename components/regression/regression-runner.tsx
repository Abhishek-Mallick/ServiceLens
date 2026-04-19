'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { TopologyView } from '@/components/topology/topology-view';
import { Play, Loader2, ChevronRight } from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import type { RegressionFlow, TopologyGraph } from '@/lib/types';

interface Run {
  id: string;
  status: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface ServiceSummary {
  id: string;
  name: string;
  framework: string | null;
  language: string | null;
  summary: string | null;
  healthStatus: string;
  producesEvents: unknown[];
  consumesEvents: unknown[];
  exposesApis: unknown[];
  consumesApis: unknown[];
  databases: unknown[];
}

interface Props {
  architectureId: string;
  architectureName: string;
  graph: TopologyGraph;
  services: ServiceSummary[];
  flows: RegressionFlow[];
  runs: Run[];
}

export function RegressionRunner({ architectureId, architectureName, graph, services, flows, runs }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  const [activeServices, setActiveServices] = useState<Set<string>>(new Set());

  const servicesByName = useMemo(() => {
    const map = new Map<string, string>();
    services.forEach((s) => map.set(s.name, s.id));
    return map;
  }, [services]);

  async function onRun() {
    setRunning(true);
    setProgressText('Booting regression engine…');
    const total = flows.reduce((s, f) => s + f.steps.length, 0);
    // Simulated progress animation on topology (actual run happens server-side).
    const steps = flows.flatMap((f) => f.steps.map((step) => ({ ...step, flowId: f.id })));
    let i = 0;
    const interval = setInterval(() => {
      const step = steps[i];
      if (!step) return;
      const svcId = servicesByName.get(step.serviceName);
      if (svcId) {
        setActiveServices(new Set([svcId]));
        const relatedEdgeIds = graph.edges
          .filter((e) => e.source === `svc-${svcId}` || e.target === `svc-${svcId}`)
          .map((e) => e.id);
        setActiveEdges(new Set(relatedEdgeIds));
      }
      setProgressText(`${i + 1}/${total} · ${step.name}`);
      i++;
      if (i >= steps.length) clearInterval(interval);
    }, 180);

    try {
      const res = await fetch(`/api/architectures/${architectureId}/regression`, { method: 'POST' });
      clearInterval(interval);
      setActiveEdges(new Set());
      setActiveServices(new Set());
      if (!res.ok) {
        toast.error('Regression run failed to start');
        setRunning(false);
        return;
      }
      const data = await res.json();
      toast.success('Regression complete');
      router.push(`/architectures/${architectureId}/regression/${data.runId}`);
    } finally {
      setRunning(false);
      setProgressText(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Regression runner</h2>
          <p className="text-sm text-muted-foreground">Execute end-to-end flows across <span className="font-medium text-foreground">{architectureName}</span>.</p>
        </div>
        <Button size="lg" onClick={onRun} disabled={running || flows.length === 0}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Running…' : 'Run regression'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Live flow</CardTitle>
            {progressText && <span className="text-xs text-muted-foreground font-mono truncate">{progressText}</span>}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[440px] rounded-md border border-border/60 overflow-hidden">
              <TopologyView
                architectureId={architectureId}
                graph={graph}
                services={services}
                animatedEdges={activeEdges}
                activeServiceIds={activeServices}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flows discovered</CardTitle>
            <CardDescription>{flows.length} test flows</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {flows.map((f) => (
              <div key={f.id} className="rounded-md border border-border/60 p-3">
                <div className="text-sm font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>
                <div className="text-[11px] text-muted-foreground mt-2">{f.steps.length} steps</div>
              </div>
            ))}
            {flows.length === 0 && <div className="text-xs text-muted-foreground">No flows discovered yet. Analyze services first.</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>{runs.length} past runs</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border/60">
          {runs.length === 0 && <div className="text-sm text-muted-foreground py-4">No runs yet.</div>}
          {runs.map((r) => {
            const passRate = r.totalSteps ? Math.round((r.passedSteps / r.totalSteps) * 100) : 0;
            return (
              <Link key={r.id} href={`/architectures/${architectureId}/regression/${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-accent/40 -mx-4 px-4 rounded">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge status={r.status} />
                  <div className="min-w-0">
                    <div className="text-sm font-mono truncate">{r.id.slice(0, 10)}…</div>
                    <div className="text-xs text-muted-foreground">{formatRelative(r.createdAt)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-success">{r.passedSteps} passed</span>
                  {r.failedSteps > 0 && <span className="text-destructive">{r.failedSteps} failed</span>}
                  <div className="hidden md:block w-24">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-success" style={{ width: `${passRate}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground text-right mt-0.5">{passRate}%</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
