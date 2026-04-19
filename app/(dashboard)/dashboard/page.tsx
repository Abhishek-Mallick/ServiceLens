import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Activity, Boxes, CheckCircle2, GitBranch, Plus, Sparkles, Zap } from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import { HealthOverviewChart } from '@/components/dashboard/health-overview-chart';
import { RegressionTrendChart } from '@/components/dashboard/regression-trend-chart';

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const [architectures, totalServices, healthCounts, recentRuns, recentServices] = await Promise.all([
    prisma.architecture.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { services: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
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
      take: 8,
    }),
    prisma.service.findMany({
      where: { architecture: { userId: session.user.id } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { architecture: { select: { name: true, id: true } } },
    }),
  ]);

  const totalArchitectures = architectures.length;
  const healthy = healthCounts.find((h) => h.healthStatus === 'healthy')?._count ?? 0;
  const degraded = healthCounts.find((h) => h.healthStatus === 'degraded')?._count ?? 0;
  const down = healthCounts.find((h) => h.healthStatus === 'down')?._count ?? 0;

  const stats = [
    { label: 'Architectures', value: totalArchitectures, icon: Boxes, accent: 'text-primary' },
    { label: 'Services', value: totalServices, icon: GitBranch, accent: 'text-indigo-400' },
    { label: 'Healthy', value: healthy, icon: CheckCircle2, accent: 'text-success' },
    { label: 'Incidents', value: degraded + down, icon: Activity, accent: 'text-warning' },
  ];

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back{session.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}</h1>
          <p className="text-muted-foreground mt-1">Your mesh at a glance — services, health, and the last regression run.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/architectures/new"><Plus className="h-4 w-4" />New architecture</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-muted ${s.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-semibold leading-none">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Recent regression runs</CardTitle>
            <CardDescription>Last {recentRuns.length} runs across your architectures</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <RegressionTrendChart runs={recentRuns.map((r) => ({ id: r.id, total: r.totalSteps, passed: r.passedSteps, failed: r.failedSteps, createdAt: r.createdAt.toISOString() }))} />
            <div className="mt-4 space-y-2">
              {recentRuns.length === 0 && <div className="text-sm text-muted-foreground">No regression runs yet. Start one from an architecture.</div>}
              {recentRuns.map((r) => (
                <Link key={r.id} href={`/architectures/${r.architectureId}/regression/${r.id}`} className="flex items-center justify-between rounded-md border border-border/60 p-3 hover:border-primary/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.architecture.name}</div>
                    <div className="text-xs text-muted-foreground">{formatRelative(r.createdAt)} · {r.totalSteps} steps</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-success">{r.passedSteps} passed</span>
                    {r.failedSteps > 0 && <span className="text-xs text-destructive">{r.failedSteps} failed</span>}
                    <StatusBadge status={r.status} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-success" /> Health overview</CardTitle>
            <CardDescription>Across all services</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <HealthOverviewChart healthy={healthy} degraded={degraded} down={down} unknown={totalServices - healthy - degraded - down} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Architectures</CardTitle>
            <CardDescription>Most recently updated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {architectures.length === 0 && (
              <div className="rounded-md border border-dashed border-border/60 p-8 text-center">
                <Sparkles className="h-6 w-6 mx-auto text-primary mb-2" />
                <div className="text-sm font-medium">No architectures yet</div>
                <div className="text-xs text-muted-foreground mb-3">Register your first microservice topology.</div>
                <Button asChild size="sm"><Link href="/architectures/new">Get started</Link></Button>
              </div>
            )}
            {architectures.map((a) => (
              <Link key={a.id} href={`/architectures/${a.id}`} className="flex items-center justify-between rounded-md border border-border/60 p-3 hover:border-primary/40 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a._count.services} services · {formatRelative(a.updatedAt)}</div>
                </div>
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity feed</CardTitle>
            <CardDescription>Recent changes to your services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {recentServices.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md p-2">
                <div className="min-w-0">
                  <div className="text-sm truncate">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground"> in {s.architecture.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{s.framework ?? s.language ?? '—'} · {formatRelative(s.updatedAt)}</div>
                </div>
                <StatusBadge status={s.healthStatus} />
              </div>
            ))}
            {recentServices.length === 0 && <div className="text-sm text-muted-foreground">No services yet.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
