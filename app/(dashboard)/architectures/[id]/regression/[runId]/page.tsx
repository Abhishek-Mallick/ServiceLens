import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { parseJson, formatDuration, formatRelative } from '@/lib/utils';
import { ArrowLeft, CheckCircle2, XCircle, Lightbulb } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RegressionRunDetail({ params }: { params: { id: string; runId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const run = await prisma.regressionRun.findFirst({
    where: { id: params.runId, architectureId: params.id, architecture: { userId: session.user.id } },
    include: {
      steps: {
        orderBy: { stepOrder: 'asc' },
        include: { service: { select: { name: true, language: true } } },
      },
      architecture: { select: { name: true } },
    },
  });
  if (!run) notFound();

  const summary = parseJson<{ summary: string; recommendations: string[] }>(run.summary, { summary: '', recommendations: [] });
  const passRate = run.totalSteps ? Math.round((run.passedSteps / run.totalSteps) * 100) : 0;
  const duration = run.startedAt && run.completedAt ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime() : null;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <Link href={`/architectures/${params.id}/regression`} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to runs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold font-mono">Run {run.id.slice(0, 10)}</h2>
            <StatusBadge status={run.status} />
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {run.architecture.name} · {formatRelative(run.createdAt)} · {run.triggeredBy ?? 'manual'}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total steps" value={run.totalSteps} />
        <StatCard label="Passed" value={run.passedSteps} accent="text-success" />
        <StatCard label="Failed" value={run.failedSteps} accent={run.failedSteps > 0 ? 'text-destructive' : undefined} />
        <StatCard label="Pass rate" value={`${passRate}%`} accent="text-primary" />
      </div>

      {duration !== null && (
        <div className="text-xs text-muted-foreground">Total duration: {formatDuration(duration)}</div>
      )}

      {summary.summary && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-primary" /> AI summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <p className="text-sm">{summary.summary}</p>
            {summary.recommendations.length > 0 && (
              <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                {summary.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
          <CardDescription>{run.steps.length} total · grouped by execution order</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y divide-border/60 -mx-4">
            {run.steps.map((s) => (
              <details key={s.id} className="group">
                <summary className="flex items-center gap-3 py-3 px-4 cursor-pointer hover:bg-accent/40 list-none">
                  {s.status === 'passed' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : s.status === 'failed' ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <span className="h-4 w-4 shrink-0 rounded-full bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.service.name} · {s.type}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDuration(s.duration)}</div>
                  <StatusBadge status={s.status} />
                </summary>
                <div className="bg-muted/30 px-4 py-3 space-y-2 text-xs">
                  {s.description && <div className="text-muted-foreground">{s.description}</div>}
                  {s.errorMessage && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-destructive">
                      {s.errorMessage}
                    </div>
                  )}
                  {s.input && (
                    <div>
                      <div className="text-muted-foreground mb-1">Input</div>
                      <pre className="bg-muted/60 p-2 rounded-md overflow-x-auto text-[11px]">{JSON.stringify(parseJson(s.input, {}), null, 2)}</pre>
                    </div>
                  )}
                  {s.actualOutput && (
                    <div>
                      <div className="text-muted-foreground mb-1">Actual output</div>
                      <pre className="bg-muted/60 p-2 rounded-md overflow-x-auto text-[11px]">{JSON.stringify(parseJson(s.actualOutput, {}), null, 2)}</pre>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className={`text-2xl font-semibold ${accent ?? ''}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}
