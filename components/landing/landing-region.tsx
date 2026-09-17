import { Fragment, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Database, ExternalLink, Radio } from 'lucide-react';
import { HealthBars } from '@/components/workspace/health-bars';
import { LandingFeatureCard } from '@/components/landing/landing-feature-card';

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/70 px-2 py-1.5">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[11px] font-medium tabular-nums text-foreground">{value}</div>
    </div>
  );
}

// Deterministic 60-check window — mostly healthy with degraded and outage clusters.
const observeHistory = Array.from({ length: 60 }, (_, i) => {
  const at = new Date(Date.now() - (59 - i) * 60_000).toISOString();
  if (i >= 9 && i <= 12) return { status: 'down', rt: null, at };
  if (i >= 19 && i <= 22) return { status: 'degraded', rt: 280 + (i % 3) * 20, at };
  if (i >= 34 && i <= 36) return { status: 'down', rt: null, at };
  if (i >= 44 && i <= 46) return { status: 'degraded', rt: 240 + (i % 4) * 15, at };
  if (i >= 52 && i <= 54) return { status: 'degraded', rt: 310, at };
  const rt = 90 + Math.round(Math.sin(i * 0.45) * 55) + (i % 5) * 8;
  return { status: 'healthy', rt, at };
});

function ObserveMock() {
  return (
    <MockFrame label="product service" meta="live · 60s">
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-start gap-1.5">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-foreground">Product Service</div>
            <div className="truncate text-[9px] text-muted-foreground">Spring Boot · Healthy · checked 3m ago</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-border/60 bg-background/70 px-2 py-0.5 text-[9px] text-foreground">
            Open service page
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
            Repo <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <MiniStat label="Uptime (24h)" value="82.9%" />
          <MiniStat label="p95 (1h)" value="329 ms" />
          <MiniStat label="Checks (24h)" value="117" />
          <MiniStat label="Error rate (1h)" value="0.4%" />
          <MiniStat label="Outbound deps" value="6 mapped" />
          <MiniStat label="Logs (24h)" value="2.4k" />
        </div>

        <div className="flex-1">
          <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Last 60 checks
          </div>
          <HealthBars points={observeHistory} />
        </div>
      </div>
    </MockFrame>
  );
}

type TraceStep = { kind: 'svc' | 'db' | 'topic'; name: string; ms?: number; slow?: boolean };

const traceSteps: TraceStep[] = [
  { kind: 'svc', name: 'Gateway', ms: 4 },
  { kind: 'svc', name: 'Orders', ms: 18 },
  { kind: 'topic', name: 'orders' },
  { kind: 'svc', name: 'Payments', ms: 62, slow: true },
];

function StepPill({ step }: { step: TraceStep }) {
  const base = 'inline-flex shrink-0 items-center gap-1 rounded-md border px-1 py-0.5 bg-background/70';
  if (step.kind === 'db') {
    return (
      <div className={`${base} border-border/60`}>
        <Database className="h-2.5 w-2.5 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono text-[9px] text-foreground">{step.name}</span>
      </div>
    );
  }
  if (step.kind === 'topic') {
    return (
      <div className={`${base} border-orange-500/40`}>
        <Radio className="h-2.5 w-2.5 text-orange-500" aria-hidden="true" />
        <span className="font-mono text-[9px] text-foreground">{step.name}</span>
      </div>
    );
  }
  return (
    <div className={`${base} border-border/60`}>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      <span className="font-mono text-[9px] text-foreground">{step.name}</span>
    </div>
  );
}

function TraceMock() {
  const timedSteps = traceSteps.filter((s) => s.ms);
  const total = timedSteps.reduce((n, s) => n + (s.ms ?? 0), 0);

  return (
    <MockFrame label="POST /checkout" meta={`${total}ms · p95`}>
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex flex-nowrap items-center gap-2 overflow-hidden">
          {traceSteps.map((s, i) => (
            <Fragment key={`${s.kind}-${s.name}-${i}`}>
              <StepPill step={s} />
              {i < traceSteps.length - 1 && (
                <ArrowRight className="h-2 w-2 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
            </Fragment>
          ))}
        </div>
        <div className="flex h-1.5 shrink-0 overflow-hidden rounded-full bg-background/70">
          {timedSteps.map((s, i) => (
            <div
              key={i}
              className={s.slow ? 'bg-yellow-500/70' : 'bg-emerald-500/70'}
              style={{ width: `${((s.ms ?? 0) / total) * 100}%` }}
            />
          ))}
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5">
          {timedSteps.map((s) => (
            <li
              key={s.name}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-border/60 bg-background/70 px-2 py-1.5"
            >
              {s.kind === 'db' ? (
                <Database className="mt-0.5 h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${s.slow ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                />
              )}
              <div className="min-w-0">
                <div className="truncate font-mono text-[11px] text-foreground">{s.name}</div>
                <div className="truncate text-[9px] text-muted-foreground">
                  {s.kind === 'db'
                    ? 'postgres · ledger'
                    : s.slow
                      ? 'env: PAYMENTS_SERVICE_URL · timeout risk'
                      : 'in-process'}
                </div>
              </div>
              <span
                className={`pt-0.5 font-mono text-[10px] tabular-nums ${s.slow ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}`}
              >
                {s.ms}ms
              </span>
            </li>
          ))}
          <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 px-2 py-1.5">
            <Radio className="mt-0.5 h-2.5 w-2.5 shrink-0 text-orange-500" aria-hidden="true" />
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px] text-foreground">orders</div>
              <div className="truncate text-[9px] text-muted-foreground">kafka · async fan-out</div>
            </div>
            <span className="pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">—</span>
          </li>
        </ul>
      </div>
    </MockFrame>
  );
}

type Sev = 'sev1' | 'sev2' | 'sev3';

const sevStyles: Record<Sev, string> = {
  sev1: 'border-red-500/40 bg-red-500/10 text-red-500',
  sev2: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  sev3: 'border-border/60 bg-muted text-muted-foreground',
};

const incidents: { title: string; svc: string; sev: Sev; when: string }[] = [
  { title: '5xx spike', svc: 'orders', sev: 'sev1', when: '2m' },
  { title: 'p95 > 500ms', svc: 'auth', sev: 'sev2', when: '14m' },
  { title: 'probe timeout', svc: 'payments', sev: 'sev2', when: '28m' },
  { title: 'contract drift', svc: 'gateway', sev: 'sev3', when: '1h' },
  { title: 'deploy regression', svc: 'product', sev: 'sev3', when: '45m' },
];

function OperateMock() {
  return (
    <MockFrame label="incidents" meta="on-call · you">
      <ul className="space-y-1.5">
        {incidents.map((i) => (
          <li
            key={i.title}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-background/70 px-2 py-1.5"
          >
            <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[11px] text-foreground">{i.title}</div>
              <div className="truncate text-[9px] text-muted-foreground">svc: {i.svc}</div>
            </div>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${sevStyles[i.sev]}`}
            >
              {i.sev}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{i.when}</span>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function MockFrame({
  label,
  meta,
  children,
}: {
  label: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{meta}</span>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const columns = [
  {
    title: 'Observe everywhere',
    body:
      'Health checks, logs, and dependency edges across every service in your architecture—mapped automatically from GitHub repos.',
    mock: <ObserveMock />,
  },
  {
    title: 'Trace anywhere',
    body:
      'See how requests flow through your mesh, which env vars wire services together, and where latency or failures cluster.',
    mock: <TraceMock />,
  },
  {
    title: 'Operate at scale',
    body:
      'Alert rules, on-call paging, regression runs, and incident timelines in one place—no more capacity planning for observability.',
    mock: <OperateMock />,
  },
];

export function LandingRegion() {
  return (
    <section id="observability" className="border-b border-border/60 px-6 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-4xl text-center">
      <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight md:text-6xl font-heading">Region: Your stack</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          One smart mesh for workloads and signals — close to your code, close to your incidents.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-[22rem_auto_auto]">
        {columns.map((col) => (
          <LandingFeatureCard key={col.title} mock={col.mock} title={col.title} body={col.body} />
        ))}
      </div>
    </section>
  );
}
