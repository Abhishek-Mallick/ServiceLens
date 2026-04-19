import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { AddServiceButton } from '@/components/architecture/add-service-button';
import { parseJson } from '@/lib/utils';
import { Cable, Database, Radio, Server } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ArchitectureOverview({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { services: true },
  });
  if (!architecture) notFound();

  const totalEvents = architecture.services.reduce(
    (sum, s) => sum + parseJson<unknown[]>(s.producesEvents, []).length,
    0
  );
  const totalApis = architecture.services.reduce(
    (sum, s) => sum + parseJson<unknown[]>(s.exposesApis, []).length,
    0
  );
  const allTopics = new Set<string>();
  architecture.services.forEach((s) => {
    parseJson<string[]>(s.kafkaTopics, []).forEach((t) => allTopics.add(t));
  });

  const byLang = new Map<string, number>();
  architecture.services.forEach((s) => {
    const k = s.language ?? 'Unknown';
    byLang.set(k, (byLang.get(k) ?? 0) + 1);
  });

  const stats = [
    { label: 'Services', value: architecture.services.length, icon: Server },
    { label: 'Kafka topics', value: allTopics.size, icon: Radio },
    { label: 'API endpoints', value: totalApis, icon: Cable },
    { label: 'Event types', value: totalEvents, icon: Database },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
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
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Services</CardTitle>
            <AddServiceButton architectureId={architecture.id} />
          </CardHeader>
          <CardContent className="pt-0">
            {architecture.services.length === 0 && (
              <div className="rounded-md border border-dashed border-border/60 p-6 text-center">
                <div className="text-sm font-medium">Add your first service</div>
                <p className="text-xs text-muted-foreground mt-1">Register a Git repo and ServiceLens will analyze it.</p>
                <div className="mt-3"><AddServiceButton architectureId={architecture.id} /></div>
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              {architecture.services.map((s) => (
                <Link key={s.id} href={`/architectures/${architecture.id}/services/${s.id}`} className="rounded-md border border-border/60 p-3 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.framework ?? s.language ?? '—'}</div>
                    </div>
                    <StatusBadge status={s.healthStatus} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Language mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {Array.from(byLang.entries()).map(([lang, count]) => {
              const pct = architecture.services.length ? Math.round((count / architecture.services.length) * 100) : 0;
              return (
                <div key={lang} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{lang}</span>
                    <span className="text-muted-foreground">{count} · {pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {byLang.size === 0 && <div className="text-sm text-muted-foreground">Analyze services to see their language.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
