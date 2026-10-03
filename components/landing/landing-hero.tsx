import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowRight, Database, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GridMotion from '@/components/GridMotion';
import { Skiper67 } from '@/components/ui/skiper-ui/skiper67';

type LandingHeroProps = {
  ctaHref: string;
};

type Health = 'healthy' | 'degraded' | 'down';
type Node =
  | { kind: 'svc'; name: string; stack: string; health: Health }
  | { kind: 'db'; name: string }
  | { kind: 'topic'; name: string };
type Flow = {
  title: string;
  main: Node[];
  branch?: Node[];
};

// Each grid tile is a mini topology: a main path (top row) and an optional
// fan-out branch (bottom row) so the backdrop reads like a mesh, not a list.
const svc = (name: string, stack: string, health: Health): Node => ({ kind: 'svc', name, stack, health });
const db = (name: string): Node => ({ kind: 'db', name });
const topic = (name: string): Node => ({ kind: 'topic', name });

const flows: Flow[] = [
  { title: 'signup',        main: [svc('Gateway', 'Express', 'healthy'), svc('Users', 'NestJS', 'healthy'), db('users_db')],                          branch: [topic('user.created'), svc('Notify', 'Node.js', 'healthy')] },
  { title: 'checkout',      main: [svc('Gateway', 'Express', 'healthy'), svc('Orders', 'Express', 'down'), svc('Payments', 'FastAPI', 'healthy'), db('ledger')], branch: [svc('Inventory', 'Standard', 'degraded'), topic('stock')] },
  { title: 'search',        main: [svc('Gateway', 'Express', 'healthy'), svc('Search', 'Node.js', 'healthy'), db('product_index')],                    branch: [db('cache'), svc('Reranker', 'Python', 'healthy')] },
  { title: 'cart',          main: [svc('Gateway', 'Express', 'healthy'), svc('Cart', 'Rails', 'healthy'), db('session')],                              branch: [svc('Users', 'NestJS', 'healthy'), db('users_db')] },
  { title: 'ship-fanout',   main: [svc('Orders', 'Express', 'down'), topic('orders'), svc('Shipping', 'Spring Boot', 'healthy'), db('sla_db')],        branch: [svc('Analytics', 'FastAPI', 'healthy'), db('warehouse')] },
  { title: 'pay-notify',    main: [svc('Payments', 'FastAPI', 'healthy'), topic('payments'), svc('Notify', 'Node.js', 'healthy'), svc('Email', 'BullMQ', 'healthy')], branch: [svc('SMS', 'Twilio', 'healthy'), topic('sms.out')] },
  { title: 'stock-sync',    main: [svc('Inventory', 'Standard', 'degraded'), topic('stock'), svc('Analytics', 'FastAPI', 'healthy'), db('warehouse')], branch: [svc('Search', 'Node.js', 'healthy'), db('product_index')] },
  { title: 'auth',          main: [svc('Gateway', 'Express', 'healthy'), svc('Auth', 'Go · Gin', 'degraded'), db('session')],                          branch: [db('users_db'), svc('Audit', 'Node.js', 'healthy')] },
  { title: 'probes',        main: [svc('Scheduler', 'Cron', 'healthy'), svc('Orders', 'Express', 'down'), svc('Incidents', 'Node.js', 'healthy')],     branch: [svc('Slack', 'Hono', 'healthy'), svc('PagerDuty', 'API', 'healthy')] },
  { title: 'rca',           main: [svc('Incident', 'Node.js', 'healthy'), svc('CFW AI', 'Workers', 'healthy'), svc('Fix PR', 'GitHub', 'healthy'), topic('github.pr')] },
  { title: 'analytics-out', main: [topic('pageviews'), svc('Analytics', 'FastAPI', 'healthy'), db('warehouse')],                                        branch: [svc('Reports', 'Python', 'healthy'), svc('Slack', 'Hono', 'healthy')] },
  { title: 'index-build',   main: [db('products_db'), svc('Indexer', 'Worker', 'healthy'), svc('Search', 'Node.js', 'healthy'), db('product_index')],  branch: [topic('index.rebuild'), db('backup')] },
  { title: 'order-notify',  main: [svc('Orders', 'Express', 'down'), svc('Notify', 'Node.js', 'healthy'), svc('Email', 'BullMQ', 'healthy')],          branch: [svc('SMS', 'Twilio', 'healthy'), topic('sms.out')] },
  { title: 'login',         main: [svc('Gateway', 'Express', 'healthy'), svc('Auth', 'Go · Gin', 'degraded'), db('users_db')],                         branch: [db('session'), svc('Audit', 'Node.js', 'healthy')] },
  { title: 'order+inv',     main: [svc('Orders', 'Express', 'down'), svc('Inventory', 'Standard', 'degraded'), db('inventory_db')],                    branch: [svc('Ledger', 'Rust', 'healthy'), db('ledger_db')] },
  { title: 'api-keys',      main: [svc('Gateway', 'Express', 'healthy'), svc('Auth', 'Go · Gin', 'degraded'), db('api_keys_db')],                      branch: [svc('Audit', 'Node.js', 'healthy'), db('audit_log')] },
  { title: 'slack-alert',   main: [svc('Incident', 'Node.js', 'healthy'), svc('Slack', 'Hono', 'healthy'), topic('slack.msg')],                        branch: [svc('PagerDuty', 'API', 'healthy'), svc('Email', 'BullMQ', 'healthy')] },
  { title: 'gh-webhook',    main: [topic('github.push'), svc('Topology', 'Deno', 'healthy'), db('services_db')],                                        branch: [svc('Indexer', 'Worker', 'healthy'), svc('Search', 'Node.js', 'healthy')] },
  { title: 'regression',    main: [svc('Runner', 'Node.js', 'healthy'), svc('Contracts', 'Jest', 'healthy'), db('runs_db')],                            branch: [svc('Reporter', 'Node.js', 'healthy'), svc('Slack', 'Hono', 'healthy')] },
  { title: 'metrics',       main: [svc('Prom', 'Scraper', 'healthy'), svc('Services', '/metrics', 'healthy'), db('tsdb')],                              branch: [svc('Grafana', 'Dash', 'healthy'), svc('Alertmanager', 'HA', 'healthy')] },
  { title: 'logs-fanout',   main: [svc('Services', 'JSON', 'healthy'), topic('logs'), db('loki')],                                                      branch: [db('s3.archive'), svc('SIEM', 'Splunk', 'healthy')] },
  { title: 'traces',        main: [svc('Services', 'OTel SDK', 'healthy'), svc('Collector', 'OTLP', 'healthy'), db('tempo')],                           branch: [svc('Grafana', 'Dash', 'healthy'), svc('Sampler', 'Tail', 'healthy')] },
  { title: 'deploys',       main: [topic('github.pr'), svc('Deployer', 'Argo', 'healthy'), svc('K8s', 'Cluster', 'healthy'), svc('Registry', 'OCI', 'healthy')], branch: [svc('Rollout', 'Canary', 'healthy'), topic('deploy.done')] },
  { title: 'chaos-drill',   main: [svc('Chaos', 'Injector', 'healthy'), svc('Orders', 'Express', 'down'), svc('Incidents', 'Node.js', 'healthy')],     branch: [svc('Slack', 'Hono', 'healthy'), svc('PagerDuty', 'API', 'healthy')] },
  { title: 'contracts',     main: [svc('Contracts', 'Pact', 'healthy'), svc('Gateway', 'Express', 'healthy'), svc('Users', 'NestJS', 'healthy')],       branch: [svc('Orders', 'Express', 'down'), svc('Payments', 'FastAPI', 'healthy')] },
  { title: 'rbac',          main: [svc('Gateway', 'Express', 'healthy'), svc('Members', 'RBAC', 'healthy'), db('members_db')],                          branch: [svc('Audit', 'Node.js', 'healthy'), db('audit_log')] },
  { title: 'retry-loop',    main: [svc('Orders', 'Express', 'down'), topic('retry'), svc('Payments', 'FastAPI', 'healthy')],                            branch: [topic('dlq'), svc('DLQ Handler', 'Worker', 'degraded')] },
  { title: 'notif-fanout',  main: [svc('Notify', 'Node.js', 'healthy'), topic('notif.email'), svc('Email', 'BullMQ', 'healthy')],                       branch: [svc('Push', 'APNs', 'healthy'), topic('push.out')] },
];

const healthDot: Record<Health, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
};

function NodeCard({ node }: { node: Node }) {
  if (node.kind === 'svc') {
    return (
      <div className="flex min-w-0 flex-1 flex-col justify-center rounded-md border border-neutral-700/80 bg-neutral-900/80 px-1 py-0.5">
        <div className="flex items-center gap-1">
          <span className={`h-1 w-1 shrink-0 rounded-full ${healthDot[node.health]}`} />
          <span className="truncate font-mono text-[8px] font-medium text-neutral-100">
            {node.name}
          </span>
        </div>
        <span className="truncate text-[7px] leading-tight text-neutral-400">{node.stack}</span>
      </div>
    );
  }
  if (node.kind === 'db') {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-neutral-700/80 bg-neutral-900/60 px-1 py-0.5">
        <Database className="h-2 w-2 shrink-0 text-neutral-400" />
        <span className="truncate font-mono text-[8px] text-neutral-300">{node.name}</span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-orange-500/40 bg-neutral-900/60 px-1 py-0.5">
      <Radio className="h-2 w-2 shrink-0 text-orange-400" />
      <span className="truncate font-mono text-[8px] text-orange-100/80">{node.name}</span>
    </div>
  );
}

function NodeRow({ nodes }: { nodes: Node[] }) {
  return (
    <div className="flex items-stretch gap-0.5">
      {nodes.map((node, i) => (
        <Fragment key={`${node.kind}-${node.name}-${i}`}>
          <NodeCard node={node} />
          {i < nodes.length - 1 && (
            <ArrowRight
              className="h-2 w-2 shrink-0 self-center text-neutral-500"
              aria-hidden="true"
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

function FlowTile({ flow }: { flow: Flow }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 px-2 py-1.5 text-left">
      <div className="truncate text-[7px] uppercase tracking-[0.2em] text-neutral-500">
        {flow.title}
      </div>
      <NodeRow nodes={flow.main} />
      {flow.branch && (
        <div className="flex items-stretch gap-0.5 pl-3">
          <div
            className="mr-0.5 h-2 w-2 shrink-0 self-start rounded-bl-md border-b border-l border-neutral-600/70"
            aria-hidden="true"
          />
          <div className="flex-1">
            <NodeRow nodes={flow.branch} />
          </div>
        </div>
      )}
    </div>
  );
}

const gridItems = flows.map((f, i) => <FlowTile key={`${f.title}-${i}`} flow={f} />);

export function LandingHero({ ctaHref }: LandingHeroProps) {
  return (
    <section
      id="platform"
      className="relative isolate overflow-hidden min-h-screen flex items-center justify-center -mt-8"
    >
      {/* Animated grid backdrop — pointer-driven parallax via gsap. */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 dark:opacity-30">
        <GridMotion items={gridItems} gradientColor="hsl(var(--background))" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/80 to-background" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-6 py-24 md:py-32 lg:grid-cols-2 lg:gap-8">
        {/* Left — content */}
        <div className="flex flex-col items-start gap-6 text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            New · AI root-cause analysis and draft fix PRs {' '}
          </div>

          <h1 className="max-w-xl text-balance text-3xl font-semibold tracking-tight md:text-4xl font-heading">
            Everything we learned from observing production meshes — yours by default
          </h1>

          <p className="max-w-xl text-balance text-xs text-muted-foreground md:text-sm">
            One platform for your services, dependencies, and incidents. Map topology from code,
            monitor every app and datastore, and respond faster without stitching tools together.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={ctaHref}>Start building for free</Link>
            </Button>
          </div>
        </div>

        {/* Right — video */}
        <div className="relative w-full">
          <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-transparent blur-2xl" />
          <Skiper67 src="/service-lens.mp4" />
        </div>
      </div>
    </section>
  );
}
