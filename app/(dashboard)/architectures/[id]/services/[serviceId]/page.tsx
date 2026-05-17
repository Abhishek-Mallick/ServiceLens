import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { parseJson, formatRelative } from '@/lib/utils';
import { ArrowLeft, Database, Radio } from 'lucide-react';
import { ProbesPanel, type ProbeRow } from '@/components/probes/probes-panel';
import { IngestTokenPanel } from '@/components/logs/ingest-token-panel';

export const dynamic = 'force-dynamic';

export default async function ServiceDetailPage({ params }: { params: { id: string; serviceId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const service = await prisma.service.findFirst({
    where: { id: params.serviceId, architecture: { id: params.id, userId: session.user.id } },
    include: {
      dependencies: { include: { dependency: true } },
      dependents: { include: { dependent: true } },
      healthHistory: { orderBy: { checkedAt: 'desc' }, take: 20 },
      probes: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!service) notFound();

  const produces = parseJson<Array<{ name: string; topic?: string }>>(service.producesEvents, []);
  const consumes = parseJson<Array<{ name: string; topic?: string }>>(service.consumesEvents, []);
  const exposes = parseJson<Array<{ method: string; path: string; description?: string }>>(service.exposesApis, []);
  const calls = parseJson<Array<{ service: string; method: string; path: string }>>(service.consumesApis, []);
  const dbs = parseJson<Array<{ type: string; name: string }>>(service.databases, []);
  const topics = parseJson<string[]>(service.kafkaTopics, []);
  const probeRows: ProbeRow[] = service.probes.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    target: p.target,
    intervalSec: p.intervalSec,
    timeoutSec: p.timeoutSec,
    expectStatus: p.expectStatus,
    enabled: p.enabled,
    lastRunAt: p.lastRunAt?.toISOString() ?? null,
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <Link href={`/architectures/${params.id}/services`} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> All services
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-3">
            {service.name}
            <StatusBadge status={service.healthStatus} />
          </h2>
          <div className="text-sm text-muted-foreground mt-1">{service.framework ?? service.language ?? '—'} · <span className="font-mono text-xs">{service.repoUrl}</span></div>
          {service.summary && <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{service.summary}</p>}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Analysis: <StatusBadge status={service.analysisStatus} /></div>
          <div className="mt-2">Last check: {formatRelative(service.lastHealthCheck)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ProbesPanel serviceId={service.id} initialProbes={probeRows} />
        <IngestTokenPanel serviceId={service.id} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Exposes</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {exposes.length === 0 && <div className="text-xs text-muted-foreground">No APIs detected.</div>}
            {exposes.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border/60 p-2">
                <Badge variant="outline" className="font-mono text-[10px]">{a.method}</Badge>
                <span className="text-sm font-mono truncate">{a.path}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Consumes</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {calls.length === 0 && <div className="text-xs text-muted-foreground">No outbound API calls detected.</div>}
            {calls.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border/60 p-2">
                <Badge variant="outline" className="font-mono text-[10px]">{a.method}</Badge>
                <span className="text-sm font-mono truncate">{a.service}{a.path}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Produces events</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {produces.length === 0 && <div className="text-xs text-muted-foreground">No events produced.</div>}
            {produces.map((e, i) => (
              <div key={i} className="rounded-md border border-border/60 p-2">
                <div className="flex items-center gap-2">
                  <Radio className="h-3.5 w-3.5 text-warning" />
                  <span className="text-sm font-medium">{e.name}</span>
                </div>
                {e.topic && <div className="text-[11px] text-muted-foreground mt-0.5">topic: <span className="font-mono">{e.topic}</span></div>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Consumes events</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {consumes.length === 0 && <div className="text-xs text-muted-foreground">No events consumed.</div>}
            {consumes.map((e, i) => (
              <div key={i} className="rounded-md border border-border/60 p-2">
                <div className="flex items-center gap-2">
                  <Radio className="h-3.5 w-3.5 text-warning" />
                  <span className="text-sm font-medium">{e.name}</span>
                </div>
                {e.topic && <div className="text-[11px] text-muted-foreground mt-0.5">topic: <span className="font-mono">{e.topic}</span></div>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Databases</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {dbs.length === 0 && <div className="text-xs text-muted-foreground">None detected.</div>}
            {dbs.map((d, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border/60 p-2">
                <Database className="h-3.5 w-3.5 text-sky-400" />
                <span className="uppercase text-[10px] text-muted-foreground">{d.type}</span>
                <span className="text-sm">{d.name}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Kafka topics</CardTitle></CardHeader>
          <CardContent className="space-y-1 pt-0">
            {topics.length === 0 && <div className="text-xs text-muted-foreground">None detected.</div>}
            {topics.map((t) => (
              <Badge key={t} variant="outline" className="font-mono text-[10px] mr-1 mb-1">{t}</Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
