import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { SimulatedBadge } from '@/components/shared/simulated-badge';
import { SeverityBadge } from '@/components/incidents/severity-badge';
import { TriggerSyntheticButton } from '@/components/incidents/trigger-synthetic-button';
import { formatRelative } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function IncidentsPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const arch = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!arch) notFound();

  const incidents = await prisma.incident.findMany({
    where: { architectureId: params.id },
    include: {
      service: { select: { id: true, name: true } },
      rule: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { openedAt: 'desc' },
    take: 100,
  });

  const open = incidents.filter((i) => i.status === 'open' || i.status === 'acknowledged' || i.status === 'mitigated');
  const resolved = incidents.filter((i) => i.status === 'resolved');

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Incidents
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{open.length} open · {resolved.length} resolved</p>
        </div>
        <TriggerSyntheticButton architectureId={params.id} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Open</CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-2">
          {open.length === 0 && <div className="text-sm text-muted-foreground">No open incidents. Mesh is healthy.</div>}
          {open.map((i) => (
            <Link key={i.id} href={`/architectures/${params.id}/incidents/${i.id}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3 hover:border-primary/40 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={i.severity} />
                  <span className="text-sm font-medium truncate">{i.title}</span>
                  {i.simulated && <SimulatedBadge />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Opened {formatRelative(i.openedAt)}
                  {i.service && <> · {i.service.name}</>}
                  {i.rule && <> · via "{i.rule.name}"</>}
                  {i.assignee && <> · assigned to {i.assignee.name ?? i.assignee.email}</>}
                </div>
              </div>
              <StatusBadge status={i.status} />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Resolved</CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-2">
          {resolved.length === 0 && <div className="text-sm text-muted-foreground">No history yet.</div>}
          {resolved.slice(0, 25).map((i) => {
            const ttr = i.resolvedAt ? Math.max(0, Math.floor((i.resolvedAt.getTime() - i.openedAt.getTime()) / 1000)) : null;
            return (
              <Link key={i.id} href={`/architectures/${params.id}/incidents/${i.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3 hover:border-primary/40 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={i.severity} />
                    <span className="text-sm font-medium truncate">{i.title}</span>
                    {i.simulated && <SimulatedBadge />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatRelative(i.openedAt)}
                    {ttr != null && <> · resolved in {ttr < 60 ? `${ttr}s` : `${Math.round(ttr / 60)}m`}</>}
                  </div>
                </div>
                <StatusBadge status="resolved" />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
