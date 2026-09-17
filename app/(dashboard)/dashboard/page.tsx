import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, readBatch } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { SimulatedBadge } from '@/components/shared/simulated-badge';
import { SeverityBadge } from '@/components/incidents/severity-badge';
import { AlertTriangle, ArrowRight, Plus, Sparkles, Zap } from 'lucide-react';
import { formatRelative, parseJson } from '@/lib/utils';
import { RegressionTrendChart } from '@/components/dashboard/regression-trend-chart';
import { TopologyPreview } from '@/components/dashboard/topology-preview';
import { buildTopology } from '@/lib/topology-builder';
import type { TopologyGraph } from '@/lib/types';
import { visibleTo } from '@/lib/access';

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const [architectures, totalServices, healthCounts, recentRuns, openIncidents, primaryArch] = await readBatch([
    prisma.architecture.findMany({
      where: visibleTo(session.user.id),
      include: { _count: { select: { services: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.service.count({ where: { architecture: visibleTo(session.user.id) } }),
    prisma.service.groupBy({
      by: ['healthStatus'],
      where: { architecture: visibleTo(session.user.id) },
      _count: true,
    }),
    prisma.regressionRun.findMany({
      where: { architecture: visibleTo(session.user.id) },
      include: { architecture: { select: { name: true, id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.incident.findMany({
      where: { architecture: visibleTo(session.user.id), status: { in: ['open', 'acknowledged'] } },
      include: { architecture: { select: { id: true, name: true } }, service: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
      take: 5,
    }),
    prisma.architecture.findFirst({
      where: visibleTo(session.user.id),
      orderBy: { updatedAt: 'desc' },
      include: { services: true },
    }),
  ]);

  const healthy = healthCounts.find((h) => h.healthStatus === 'healthy')?._count ?? 0;
  const degraded = healthCounts.find((h) => h.healthStatus === 'degraded')?._count ?? 0;
  const down = healthCounts.find((h) => h.healthStatus === 'down')?._count ?? 0;
  const totalIncidentsOpen = openIncidents.length;
  // Everyone can see the shared demo; prompt until they have a real architecture.
  const hasOwnArchitecture = architectures.some((a) => !a.demo);

  let heroGraph: TopologyGraph | null = null;
  let heroServices: Array<{
    id: string; name: string; framework: string | null; language: string | null; summary: string | null; healthStatus: string;
    producesEvents: unknown[]; consumesEvents: unknown[]; exposesApis: unknown[]; consumesApis: unknown[]; databases: unknown[];
  }> = [];
  if (primaryArch && primaryArch.services.length > 0) {
    const cached = parseJson<TopologyGraph>(primaryArch.topologyData, { nodes: [], edges: [] });
    heroGraph = cached.nodes.length ? cached : buildTopology(primaryArch.services).graph;
    heroServices = primaryArch.services.map((s) => ({
      id: s.id, name: s.name, framework: s.framework, language: s.language, summary: s.summary, healthStatus: s.healthStatus,
      producesEvents: parseJson<unknown[]>(s.producesEvents, []),
      consumesEvents: parseJson<unknown[]>(s.consumesEvents, []),
      exposesApis: parseJson<unknown[]>(s.exposesApis, []),
      consumesApis: parseJson<unknown[]>(s.consumesApis, []),
      databases: parseJson<unknown[]>(s.databases, []),
    }));
  }

  // Atmosphere matches the worst current state — red if anything is down or has an open incident.
  const glow = down > 0 || totalIncidentsOpen > 0 ? '' : degraded > 0 ? '' : '';
  const firstName = session.user.name ? session.user.name.split(' ')[0] : null;

  return (
    <div>
      <section className={`relative ${glow}`}>
        <div className="px-6 pb-10 pt-14 lg:px-8">
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-5">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </div>
          <h1 className="font-heading text-[64px] md:text-[88px] leading-[0.95] tracking-tight text-foreground max-w-3xl">
            The mesh,<br />observed.
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Live topology, real probes, real incidents — with an AI engineer waiting to suggest the fix.
          </p>

          <div className="mt-7 flex items-center gap-3">
            <Button asChild>
              <Link href="/architectures/new"><Plus className="h-4 w-4" />New architecture</Link>
            </Button>
            {primaryArch && (
              <Button variant="outline" asChild>
                <Link href={`/architectures/${primaryArch.id}`}>Open workspace<ArrowRight className="h-4 w-4" /></Link>
              </Button>
            )}
          </div>

          {!hasOwnArchitecture && (
            <div className="mt-8 max-w-2xl rounded-lg border border-border bg-card p-5" data-testid="onboarding-callout">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Get started</div>
              <div className="text-foreground font-medium">Onboard your own services</div>
              <p className="text-[13px] text-muted-foreground mt-1">
                The E-Commerce Platform is a simulated demo. Add your GitHub repos and deployed URLs and ServiceLens maps their
                dependencies from code, health-checks them every minute, and opens incidents with an RCA and a fix PR when they break.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" asChild><Link href="/architectures/new"><Plus className="h-4 w-4" />Create an architecture</Link></Button>
                <Button size="sm" variant="outline" asChild><Link href="/SKILL.md" target="_blank">Onboard from CI or an agent</Link></Button>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-2 text-[11px]">
            <Pill label="Architectures" value={architectures.length} />
            <Pill label="Services" value={totalServices} />
            <Pill label="Healthy" value={healthy} tone="green" />
            {(degraded > 0) && <Pill label="Degraded" value={degraded} tone="orange" />}
            {(down > 0) && <Pill label="Down" value={down} tone="red" />}
            <Pill label="Open incidents" value={totalIncidentsOpen} tone={totalIncidentsOpen > 0 ? 'red' : undefined} />
          </div>
        </div>
      </section>

      {heroGraph && primaryArch && (
        <section className="px-6 pb-8 lg:px-8">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Topology</div>
              <h2 className="font-sans text-2xl text-foreground">{primaryArch.name}</h2>
            </div>
            <Link href={`/architectures/${primaryArch.id}/topology`} className="text-[12px] text-blue-500 hover:underline">
              Full topology →
            </Link>
          </div>
          <TopologyPreview
            architectureId={primaryArch.id}
            architectureName={primaryArch.name}
            graph={heroGraph}
            services={heroServices}
            height={360}
          />
        </section>
      )}

      <section className="grid gap-6 px-6 pb-16 lg:grid-cols-3 lg:px-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-foreground" /> Recent regression runs</CardTitle>
            <CardDescription>Last {recentRuns.length} runs across your architectures</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <RegressionTrendChart runs={recentRuns.map((r) => ({ id: r.id, total: r.totalSteps, passed: r.passedSteps, failed: r.failedSteps, createdAt: r.createdAt.toISOString() }))} />
            <div className="mt-4 space-y-2">
              {recentRuns.length === 0 && <div className="text-sm text-muted-foreground">No regression runs yet. Start one from an architecture.</div>}
              {recentRuns.map((r) => (
                <Link key={r.id} href={`/architectures/${r.architectureId}/regression/${r.id}`} className="flex items-center justify-between rounded-md border border-border/50 p-3 hover:border-border transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate text-foreground">{r.architecture.name}</div>
                    <div className="text-[11px] text-muted-foreground">{formatRelative(r.createdAt)} · {r.totalSteps} steps</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-emerald-500">{r.passedSteps} passed</span>
                    {r.failedSteps > 0 && <span className="text-[11px] text-red-500">{r.failedSteps} failed</span>}
                    {r.simulated && <SimulatedBadge />}
                    <StatusBadge status={r.status} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" /> Open incidents</CardTitle>
            <CardDescription>{totalIncidentsOpen === 0 ? 'No active incidents' : `${totalIncidentsOpen} requires attention`}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {openIncidents.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <div className="text-sm font-medium text-foreground">All clear</div>
                <div className="text-[11px] text-muted-foreground mt-1">Mesh is healthy end-to-end.</div>
              </div>
            )}
            {openIncidents.map((i) => (
              <Link key={i.id} href={`/architectures/${i.architectureId}/incidents/${i.id}`} className="block rounded-md border border-border/50 p-3 hover:border-border transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={i.severity} />
                  {i.simulated && <SimulatedBadge />}
                </div>
                <div className="text-sm text-foreground truncate">{i.title}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{i.architecture.name}{i.service?.name ? ` · ${i.service.name}` : ''} · {formatRelative(i.openedAt)}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="px-6 pb-16 lg:px-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-sans text-2xl text-foreground">Architectures</h2>
          <Link href="/architectures" className="text-[12px] text-blue-500 hover:underline">All →</Link>
        </div>
        {architectures.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <Sparkles className="h-6 w-6 mx-auto text-foreground mb-2" />
            <div className="text-sm font-medium text-foreground">No architectures yet</div>
            <div className="text-[11px] text-muted-foreground mb-4">Register your first microservice topology.</div>
            <Button asChild size="sm"><Link href="/architectures/new">Get started</Link></Button>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {architectures.map((a) => (
            <Link key={a.id} href={`/architectures/${a.id}`} className="block rounded-lg border border-border/50 p-4 hover:border-border transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-medium text-foreground truncate">{a.name}</div>
                <StatusBadge status={a.status} />
              </div>
              <div className="text-[11px] text-muted-foreground">{a._count.services} services · {formatRelative(a.updatedAt)}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'orange' | 'red' }) {
  const toneClass =
    tone === 'green' ? 'text-emerald-500' :
    tone === 'orange' ? 'text-orange-500' :
    tone === 'red' ? 'text-red-500' : 'text-foreground';
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-muted border border-border px-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${toneClass}`}>{value}</span>
    </span>
  );
}
