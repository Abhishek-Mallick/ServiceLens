import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
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

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const [architectures, totalServices, healthCounts, recentRuns, openIncidents, primaryArch] = await Promise.all([
    prisma.architecture.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { services: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.service.count({ where: { architecture: { userId: session.user.id } } }),
    prisma.service.groupBy({
      by: ['healthStatus'],
      where: { architecture: { userId: session.user.id } },
      _count: true,
    }),
    prisma.regressionRun.findMany({
      where: { architecture: { userId: session.user.id } },
      include: { architecture: { select: { name: true, id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.incident.findMany({
      where: { architecture: { userId: session.user.id }, status: { in: ['open', 'acknowledged'] } },
      include: { architecture: { select: { id: true, name: true } }, service: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
      take: 5,
    }),
    prisma.architecture.findFirst({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      include: { services: true },
    }),
  ]);

  const healthy = healthCounts.find((h) => h.healthStatus === 'healthy')?._count ?? 0;
  const degraded = healthCounts.find((h) => h.healthStatus === 'degraded')?._count ?? 0;
  const down = healthCounts.find((h) => h.healthStatus === 'down')?._count ?? 0;
  const totalIncidentsOpen = openIncidents.length;

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
  const glow = down > 0 || totalIncidentsOpen > 0 ? 'glow-red' : degraded > 0 ? 'glow-orange' : 'glow-blue';
  const firstName = session.user.name ? session.user.name.split(' ')[0] : null;

  return (
    <div>
      <section className={`relative ${glow}`}>
        <div className="px-6 lg:px-10 pt-14 pb-10 max-w-6xl mx-auto">
          <div className="text-[11px] uppercase tracking-[0.25em] text-white/50 mb-5">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </div>
          <h1 className="font-display text-[64px] md:text-[88px] leading-[0.95] tracking-tight text-ink max-w-3xl">
            The mesh,<br />observed.
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/70">
            Live topology, real probes, real incidents — with an AI engineer waiting to suggest the fix.
          </p>

          <div className="mt-7 flex items-center gap-3">
            <Button asChild>
              <Link href="/architectures/new"><Plus className="h-4 w-4" />New architecture</Link>
            </Button>
            {primaryArch && (
              <Button variant="outline" asChild>
                <Link href={`/architectures/${primaryArch.id}/topology`}>Open topology<ArrowRight className="h-4 w-4" /></Link>
              </Button>
            )}
          </div>

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
        <section className="px-6 lg:px-10 max-w-6xl mx-auto pb-8">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Topology</div>
              <h2 className="font-display text-2xl text-ink">{primaryArch.name}</h2>
            </div>
            <Link href={`/architectures/${primaryArch.id}/topology`} className="text-[12px] text-accent-blue hover:underline">
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

      <section className="px-6 lg:px-10 max-w-6xl mx-auto pb-16 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-ink" /> Recent regression runs</CardTitle>
            <CardDescription>Last {recentRuns.length} runs across your architectures</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <RegressionTrendChart runs={recentRuns.map((r) => ({ id: r.id, total: r.totalSteps, passed: r.passedSteps, failed: r.failedSteps, createdAt: r.createdAt.toISOString() }))} />
            <div className="mt-4 space-y-2">
              {recentRuns.length === 0 && <div className="text-sm text-white/50">No regression runs yet. Start one from an architecture.</div>}
              {recentRuns.map((r) => (
                <Link key={r.id} href={`/architectures/${r.architectureId}/regression/${r.id}`} className="flex items-center justify-between rounded-md border border-white/[0.06] p-3 hover:border-white/[0.2] transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate text-ink">{r.architecture.name}</div>
                    <div className="text-[11px] text-white/50">{formatRelative(r.createdAt)} · {r.totalSteps} steps</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-accent-green">{r.passedSteps} passed</span>
                    {r.failedSteps > 0 && <span className="text-[11px] text-accent-red">{r.failedSteps} failed</span>}
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
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-accent-orange" /> Open incidents</CardTitle>
            <CardDescription>{totalIncidentsOpen === 0 ? 'No active incidents' : `${totalIncidentsOpen} requires attention`}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {openIncidents.length === 0 && (
              <div className="rounded-md border border-dashed border-white/[0.08] p-6 text-center">
                <div className="text-sm font-medium text-ink">All clear</div>
                <div className="text-[11px] text-white/50 mt-1">Mesh is healthy end-to-end.</div>
              </div>
            )}
            {openIncidents.map((i) => (
              <Link key={i.id} href={`/architectures/${i.architectureId}/incidents/${i.id}`} className="block rounded-md border border-white/[0.06] p-3 hover:border-white/[0.2] transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={i.severity} />
                  {i.simulated && <SimulatedBadge />}
                </div>
                <div className="text-sm text-ink truncate">{i.title}</div>
                <div className="text-[11px] text-white/50 mt-1">{i.architecture.name}{i.service?.name ? ` · ${i.service.name}` : ''} · {formatRelative(i.openedAt)}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="px-6 lg:px-10 max-w-6xl mx-auto pb-16">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-2xl text-ink">Architectures</h2>
          <Link href="/architectures" className="text-[12px] text-accent-blue hover:underline">All →</Link>
        </div>
        {architectures.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/[0.08] p-10 text-center">
            <Sparkles className="h-6 w-6 mx-auto text-ink mb-2" />
            <div className="text-sm font-medium text-ink">No architectures yet</div>
            <div className="text-[11px] text-white/50 mb-4">Register your first microservice topology.</div>
            <Button asChild size="sm"><Link href="/architectures/new">Get started</Link></Button>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {architectures.map((a) => (
            <Link key={a.id} href={`/architectures/${a.id}`} className="block rounded-lg border border-white/[0.06] p-4 hover:border-white/[0.2] transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-medium text-ink truncate">{a.name}</div>
                <StatusBadge status={a.status} />
              </div>
              <div className="text-[11px] text-white/50">{a._count.services} services · {formatRelative(a.updatedAt)}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'orange' | 'red' }) {
  const toneClass =
    tone === 'green' ? 'text-accent-green' :
    tone === 'orange' ? 'text-accent-orange' :
    tone === 'red' ? 'text-accent-red' : 'text-ink';
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-surface-elevated border border-white/[0.08] px-3 py-1">
      <span className="text-white/50">{label}</span>
      <span className={`font-medium ${toneClass}`}>{value}</span>
    </span>
  );
}
