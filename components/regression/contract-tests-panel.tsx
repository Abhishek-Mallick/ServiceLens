'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { FlaskConical, Loader2, Play } from 'lucide-react';
import { formatRelative } from '@/lib/utils';

interface Check { serviceId: string; serviceName: string; method: string; path: string; url: string; source: string }
interface Skip { serviceId: string; serviceName: string; method: string; path: string; reason: string }
interface Run { id: string; status: string; totalSteps: number; passedSteps: number; failedSteps: number; triggeredBy: string | null; createdAt: string; completedAt: string | null }

const SCHEDULES: Array<[number, string]> = [[0, 'Manual only'], [60, 'Every hour'], [360, 'Every 6 hours'], [1440, 'Daily']];

export function ContractTestsPanel({
  architectureId,
  canEdit,
  canOwn,
  initial,
}: {
  architectureId: string;
  canEdit: boolean;
  canOwn: boolean;
  initial: { plan: { checks: Check[]; skipped: Skip[] }; runs: Run[]; intervalMin: number };
}) {
  const router = useRouter();
  const [runs, setRuns] = useState(initial.runs);
  const [interval, setIntervalMin] = useState(initial.intervalMin);
  const [busy, setBusy] = useState<'run' | 'schedule' | null>(null);
  const { checks, skipped } = initial.plan;

  async function run() {
    setBusy('run');
    const r = await fetch(`/api/architectures/${architectureId}/contract-tests`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { toast.error(j.error ?? 'Run failed'); return; }
    if (j.failed) toast.error(`${j.failed} of ${j.total} routes failed`);
    else toast.success(j.total ? `All ${j.total} routes passed` : 'Nothing to test yet');
    const list = await fetch(`/api/architectures/${architectureId}/contract-tests`).then((x) => x.json()).catch(() => null);
    if (list?.runs) setRuns(list.runs);
    router.refresh();
  }

  async function schedule(v: number) {
    setBusy('schedule');
    const r = await fetch(`/api/architectures/${architectureId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractTestIntervalMin: v }),
    });
    setBusy(null);
    if (!r.ok) { toast.error('Could not update the schedule'); return; }
    setIntervalMin(v);
    toast.success(v ? `Contract tests will run ${SCHEDULES.find(([m]) => m === v)?.[1].toLowerCase()}` : 'Scheduled runs off');
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Contract tests</CardTitle>
            <CardDescription className="max-w-2xl">
              Calls every GET route found in each service&apos;s code on its deployed URL. 2xx/3xx pass, and so do 401/403 (the route exists but needs auth).
              404/405 mean the deployment doesn&apos;t serve a route the code defines. 5xx and timeouts fail. No test code to write.
            </CardDescription>
          </div>
          {canEdit && (
            <Button onClick={run} disabled={busy !== null || checks.length === 0}>
              {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-muted-foreground">Schedule:</span>
            {canOwn ? (
              <select className="h-8 rounded-md border border-input bg-background px-2 text-[12px]" value={interval} disabled={busy !== null} onChange={(e) => schedule(Number(e.target.value))} aria-label="Contract test schedule">
                {SCHEDULES.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
              </select>
            ) : (
              <span>{SCHEDULES.find(([m]) => m === interval)?.[1] ?? `every ${interval} min`}</span>
            )}
            <span className="text-muted-foreground">· From CI: <code>POST /api/v1/contract-tests</code> with an API key (fail the build when <code>failed &gt; 0</code>).</span>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1.5">Routes that will be called ({checks.length})</div>
            {checks.length === 0 ? (
              <div className="text-sm text-muted-foreground">None yet. Services need a deployed URL and at least one GET route without parameters, found by analysis.</div>
            ) : (
              <div className="rounded-md border border-border/60 divide-y divide-border/40 max-h-64 overflow-y-auto">
                {checks.map((c) => (
                  <div key={c.url} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
                    <span className="w-32 truncate text-muted-foreground">{c.serviceName}</span>
                    <code className="truncate">GET {c.path}</code>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground truncate">{c.source}</span>
                  </div>
                ))}
              </div>
            )}
            {skipped.length > 0 && (
              <details className="mt-2">
                <summary className="text-[12px] text-muted-foreground cursor-pointer">{skipped.length} route{skipped.length === 1 ? '' : 's'} not called, and why</summary>
                <div className="mt-1 space-y-0.5">
                  {skipped.map((s, i) => (
                    <div key={i} className="text-[12px] text-muted-foreground"><span className="text-foreground">{s.serviceName}</span> · <code>{s.method} {s.path}</code>: {s.reason}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Runs</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {runs.length === 0 && <div className="text-sm text-muted-foreground">No runs yet.</div>}
          <div className="divide-y divide-border/40">
            {runs.map((r) => (
              <Link key={r.id} href={`/architectures/${architectureId}/regression/${r.id}`} className="flex items-center gap-3 py-2 text-[13px] hover:bg-accent/30 px-2 -mx-2 rounded">
                <StatusBadge status={r.status} />
                <span>{r.passedSteps}/{r.totalSteps} passed</span>
                {r.failedSteps > 0 && <span className="text-destructive">{r.failedSteps} failed</span>}
                <span className="ml-auto text-muted-foreground">{r.triggeredBy ?? 'manual'} · {formatRelative(new Date(r.createdAt))}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
