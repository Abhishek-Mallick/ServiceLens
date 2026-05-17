import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { SimulatedBadge } from '@/components/shared/simulated-badge';
import { SeverityBadge } from '@/components/incidents/severity-badge';
import { IncidentActions } from '@/components/incidents/incident-actions';
import { formatRelative, parseJson } from '@/lib/utils';
import { ArrowLeft, MessageSquare, AlertCircle, CheckCircle2, Check, UserPlus, Bot, FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

const eventIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  opened: AlertCircle,
  acked: Check,
  resolved: CheckCircle2,
  comment: MessageSquare,
  assigned: UserPlus,
  rca_started: Bot,
  rca_completed: Bot,
  fix_pr_generated: FileText,
  notification_sent: MessageSquare,
  status_change: AlertCircle,
};

export default async function IncidentDetailPage({ params }: { params: { id: string; incidentId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const incident = await prisma.incident.findFirst({
    where: { id: params.incidentId, architecture: { id: params.id, userId: session.user.id } },
    include: {
      service: true,
      rule: true,
      assignee: { select: { id: true, name: true, email: true } },
      events: {
        orderBy: { at: 'asc' },
        include: { byUser: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!incident) notFound();

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <Link href={`/architectures/${params.id}/incidents`} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> All incidents
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            {incident.simulated && <SimulatedBadge />}
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">source: {incident.source}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-2">{incident.title}</h1>
          {incident.summary && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{incident.summary}</p>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {incident.rcaMarkdown && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" /> AI root-cause analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{incident.rcaMarkdown}</pre>
                {incident.rcaModel && <div className="text-[10px] text-muted-foreground mt-3">model: {incident.rcaModel}</div>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ol className="relative border-l border-border/60 ml-2 space-y-4">
                {incident.events.map((ev) => {
                  const Icon = eventIcon[ev.type] ?? AlertCircle;
                  const payload = ev.payload ? parseJson<Record<string, unknown>>(ev.payload, {}) : null;
                  const text = payload && typeof payload.text === 'string' ? payload.text : null;
                  const reason = payload && typeof payload.reason === 'string' ? payload.reason : null;
                  const resolution = payload && typeof payload.resolution === 'string' ? payload.resolution : null;
                  return (
                    <li key={ev.id} className="ml-4">
                      <span className="absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background border border-border">
                        <Icon className="h-2.5 w-2.5" />
                      </span>
                      <div className="text-xs text-muted-foreground">{formatRelative(ev.at)} {ev.byUser && <>· {ev.byUser.name ?? ev.byUser.email}</>}</div>
                      <div className="text-sm capitalize">{ev.type.replace(/_/g, ' ')}{reason ? ` (${reason})` : ''}</div>
                      {text && <div className="text-sm text-muted-foreground mt-1 rounded-md border border-border/60 p-2 bg-muted/20">{text}</div>}
                      {resolution && <div className="text-sm text-muted-foreground mt-1 rounded-md border border-border/60 p-2 bg-muted/20"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Resolution</span><br />{resolution}</div>}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Actions</CardTitle></CardHeader>
            <CardContent>
              <IncidentActions incidentId={incident.id} status={incident.status} />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3 text-sm">
            <Field label="Opened">{formatRelative(incident.openedAt)}</Field>
            {incident.ackedAt && <Field label="Acknowledged">{formatRelative(incident.ackedAt)}</Field>}
            {incident.resolvedAt && <Field label="Resolved">{formatRelative(incident.resolvedAt)}</Field>}
            {incident.service && (
              <Field label="Service">
                <Link href={`/architectures/${params.id}/services/${incident.service.id}`} className="text-primary hover:underline">{incident.service.name}</Link>
              </Field>
            )}
            {incident.rule && (
              <Field label="Rule">
                <Link href={`/architectures/${params.id}/alerts`} className="text-primary hover:underline">{incident.rule.name}</Link>
              </Field>
            )}
            <Field label="Assignee">{incident.assignee ? (incident.assignee.name ?? incident.assignee.email) : '—'}</Field>
            {incident.resolution && <Field label="Resolution">{incident.resolution}</Field>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
