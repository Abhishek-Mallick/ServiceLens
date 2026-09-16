import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowRight, Database, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GridMotion from '@/components/GridMotion';

type LandingHeroProps = {
  ctaHref: string;
};

type Health = 'healthy' | 'degraded' | 'down';
type Node =
  | { kind: 'svc'; name: string; stack: string; health: Health }
  | { kind: 'db'; name: string }
  | { kind: 'topic'; name: string };
type Flow = { title: string; nodes: Node[] };

// One mini-workflow per grid tile. Each row of nodes reads left-to-right like
// a slice of the demo mesh (service → topic/db → service).
const flows: Flow[] = [
  { title: 'signup',        nodes: [{ kind: 'svc', name: 'Gateway',   stack: 'Express',   health: 'healthy' }, { kind: 'svc', name: 'Users',      stack: 'NestJS',      health: 'healthy' },  { kind: 'db',    name: 'users_db' }] },
  { title: 'checkout',      nodes: [{ kind: 'svc', name: 'Gateway',   stack: 'Express',   health: 'healthy' }, { kind: 'svc', name: 'Orders',     stack: 'Express',     health: 'down' },     { kind: 'svc', name: 'Payments',  stack: 'FastAPI',     health: 'healthy' }] },
  { title: 'search',        nodes: [{ kind: 'svc', name: 'Gateway',   stack: 'Express',   health: 'healthy' }, { kind: 'svc', name: 'Search',     stack: 'Node.js',     health: 'healthy' },  { kind: 'db',    name: 'product_index' }] },
  { title: 'cart',          nodes: [{ kind: 'svc', name: 'Gateway',   stack: 'Express',   health: 'healthy' }, { kind: 'svc', name: 'Cart',       stack: 'Rails',       health: 'healthy' },  { kind: 'db',    name: 'session' }] },
  { title: 'ship-fanout',   nodes: [{ kind: 'svc', name: 'Orders',    stack: 'Express',   health: 'down' },    { kind: 'topic', name: 'orders' },                                              { kind: 'svc', name: 'Shipping',  stack: 'Spring Boot', health: 'healthy' }] },
  { title: 'pay-notify',    nodes: [{ kind: 'svc', name: 'Payments',  stack: 'FastAPI',   health: 'healthy' }, { kind: 'topic', name: 'payments' },                                            { kind: 'svc', name: 'Notify',    stack: 'Node.js',     health: 'healthy' }] },
  { title: 'stock-sync',    nodes: [{ kind: 'svc', name: 'Inventory', stack: 'Standard',  health: 'degraded' },{ kind: 'topic', name: 'stock' },                                               { kind: 'svc', name: 'Analytics', stack: 'FastAPI',     health: 'healthy' }] },
  { title: 'auth',          nodes: [{ kind: 'svc', name: 'Gateway',   stack: 'Express',   health: 'healthy' }, { kind: 'svc', name: 'Auth',       stack: 'Go · Gin',    health: 'degraded' }, { kind: 'db',    name: 'session' }] },
  { title: 'probes',        nodes: [{ kind: 'svc', name: 'Scheduler', stack: 'Cron',      health: 'healthy' }, { kind: 'svc', name: 'Orders',     stack: 'Express',     health: 'down' },     { kind: 'svc', name: 'Incidents', stack: 'Node.js',     health: 'healthy' }] },
  { title: 'rca',           nodes: [{ kind: 'svc', name: 'Incident',  stack: 'Node.js',   health: 'healthy' }, { kind: 'svc', name: 'OpenRouter', stack: 'AI',          health: 'healthy' },  { kind: 'svc', name: 'Fix PR',    stack: 'GitHub',      health: 'healthy' }] },
  { title: 'analytics-out', nodes: [{ kind: 'topic', name: 'pageviews' },                                       { kind: 'svc', name: 'Analytics',  stack: 'FastAPI',     health: 'healthy' },  { kind: 'db',    name: 'warehouse' }] },
  { title: 'index-build',   nodes: [{ kind: 'db',    name: 'products_db' },                                     { kind: 'svc', name: 'Indexer',    stack: 'Worker',      health: 'healthy' },  { kind: 'svc', name: 'Search',    stack: 'Node.js',     health: 'healthy' }] },
  { title: 'order-notify',  nodes: [{ kind: 'svc', name: 'Orders',    stack: 'Express',   health: 'down' },    { kind: 'svc', name: 'Notify',     stack: 'Node.js',     health: 'healthy' },  { kind: 'svc', name: 'Email',     stack: 'BullMQ',      health: 'healthy' }] },
  { title: 'login',         nodes: [{ kind: 'svc', name: 'Gateway',   stack: 'Express',   health: 'healthy' }, { kind: 'svc', name: 'Auth',       stack: 'Go · Gin',    health: 'degraded' }, { kind: 'db',    name: 'users_db' }] },
  { title: 'order+inv',     nodes: [{ kind: 'svc', name: 'Orders',    stack: 'Express',   health: 'down' },    { kind: 'svc', name: 'Inventory',  stack: 'Standard',    health: 'degraded' },{ kind: 'db',    name: 'inventory_db' }] },
  { title: 'api-keys',      nodes: [{ kind: 'svc', name: 'Gateway',   stack: 'Express',   health: 'healthy' }, { kind: 'svc', name: 'Auth',       stack: 'Go · Gin',    health: 'degraded' }, { kind: 'db',    name: 'api_keys_db' }] },
  { title: 'slack-alert',   nodes: [{ kind: 'svc', name: 'Incident',  stack: 'Node.js',   health: 'healthy' }, { kind: 'svc', name: 'Slack',      stack: 'Hono',        health: 'healthy' }] },
  { title: 'gh-webhook',    nodes: [{ kind: 'topic', name: 'github.push' },                                    { kind: 'svc', name: 'Topology',   stack: 'Deno',        health: 'healthy' },  { kind: 'db',    name: 'services_db' }] },
  { title: 'regression',    nodes: [{ kind: 'svc', name: 'Runner',    stack: 'Node.js',   health: 'healthy' }, { kind: 'svc', name: 'Contracts',  stack: 'Jest',        health: 'healthy' },  { kind: 'db',    name: 'runs_db' }] },
  { title: 'metrics',       nodes: [{ kind: 'svc', name: 'Prom',      stack: 'Scraper',   health: 'healthy' }, { kind: 'svc', name: 'Services',   stack: '/metrics',    health: 'healthy' }] },
  { title: 'logs-fanout',   nodes: [{ kind: 'svc', name: 'Services',  stack: 'JSON',      health: 'healthy' }, { kind: 'topic', name: 'logs' },                                                { kind: 'db',    name: 'loki' }] },
  { title: 'traces',        nodes: [{ kind: 'svc', name: 'Services',  stack: 'OTel SDK',  health: 'healthy' }, { kind: 'svc', name: 'Collector',  stack: 'OTLP',        health: 'healthy' },  { kind: 'db',    name: 'tempo' }] },
  { title: 'deploys',       nodes: [{ kind: 'topic', name: 'github.pr' },                                      { kind: 'svc', name: 'Deployer',   stack: 'Argo',        health: 'healthy' },  { kind: 'svc', name: 'K8s',       stack: 'Cluster',     health: 'healthy' }] },
  { title: 'chaos-drill',   nodes: [{ kind: 'svc', name: 'Chaos',     stack: 'Injector',  health: 'healthy' }, { kind: 'svc', name: 'Orders',     stack: 'Express',     health: 'down' },     { kind: 'svc', name: 'Incidents', stack: 'Node.js',     health: 'healthy' }] },
  { title: 'contracts',     nodes: [{ kind: 'svc', name: 'Contracts', stack: 'Pact',      health: 'healthy' }, { kind: 'svc', name: 'Gateway',    stack: 'Express',     health: 'healthy' },  { kind: 'svc', name: 'Users',     stack: 'NestJS',      health: 'healthy' }] },
  { title: 'rbac',          nodes: [{ kind: 'svc', name: 'Gateway',   stack: 'Express',   health: 'healthy' }, { kind: 'svc', name: 'Members',    stack: 'RBAC',        health: 'healthy' },  { kind: 'db',    name: 'members_db' }] },
  { title: 'retry-loop',    nodes: [{ kind: 'svc', name: 'Orders',    stack: 'Express',   health: 'down' },    { kind: 'topic', name: 'retry' },                                               { kind: 'svc', name: 'Payments',  stack: 'FastAPI',     health: 'healthy' }] },
  { title: 'notif-fanout',  nodes: [{ kind: 'svc', name: 'Notify',    stack: 'Node.js',   health: 'healthy' }, { kind: 'topic', name: 'notif.email' },                                         { kind: 'svc', name: 'Email',     stack: 'BullMQ',      health: 'healthy' }] },
];

const healthDot: Record<Health, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
};

function NodeCard({ node }: { node: Node }) {
  if (node.kind === 'svc') {
    return (
      <div className="flex min-w-0 flex-1 flex-col justify-center rounded-md border border-neutral-700/80 bg-neutral-900/80 px-1.5 py-1">
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDot[node.health]}`} />
          <span className="truncate font-mono text-[9px] font-medium text-neutral-100">
            {node.name}
          </span>
        </div>
        <span className="truncate text-[8px] leading-tight text-neutral-400">{node.stack}</span>
      </div>
    );
  }
  if (node.kind === 'db') {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-neutral-700/80 bg-neutral-900/60 px-1.5 py-1">
        <Database className="h-2.5 w-2.5 shrink-0 text-neutral-400" />
        <span className="truncate font-mono text-[9px] text-neutral-300">{node.name}</span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-orange-500/40 bg-neutral-900/60 px-1.5 py-1">
      <Radio className="h-2.5 w-2.5 shrink-0 text-orange-400" />
      <span className="truncate font-mono text-[9px] text-orange-100/80">{node.name}</span>
    </div>
  );
}

function FlowTile({ flow }: { flow: Flow }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 px-2.5 py-2 text-left">
      <div className="truncate text-[8px] uppercase tracking-[0.2em] text-neutral-500">
        {flow.title}
      </div>
      <div className="flex items-stretch gap-1">
        {flow.nodes.map((node, i) => (
          <Fragment key={`${node.kind}-${node.name}-${i}`}>
            <NodeCard node={node} />
            {i < flow.nodes.length - 1 && (
              <ArrowRight
                className="h-2.5 w-2.5 shrink-0 self-center text-neutral-500"
                aria-hidden="true"
              />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const gridItems = flows.map((f, i) => <FlowTile key={`${f.title}-${i}`} flow={f} />);

export function LandingHero({ ctaHref }: LandingHeroProps) {
  return (
    <section
      id="platform"
      className="relative isolate overflow-hidden h-screen flex items-center justify-center -mt-8"
    >
      {/* Animated grid backdrop — pointer-driven parallax via gsap. */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 dark:opacity-30">
        <GridMotion items={gridItems} gradientColor="hsl(var(--background))" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/80 to-background" />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-24 text-center md:py-32">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          New · AI root-cause analysis and draft fix PRs ·{' '}
          <Link href={ctaHref} className="underline underline-offset-2 hover:no-underline">
            Try it now
          </Link>
        </div>

        <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight md:text-6xl font-heading">
          Everything we learned from observing production meshes — yours by default
        </h1>

        <p className="max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
          One platform for your services, dependencies, and incidents. Map topology from code,
          monitor every app and datastore, and respond faster without stitching tools together.
        </p>

        <Button asChild size="lg">
          <Link href={ctaHref}>Start building for free</Link>
        </Button>
      </div>
    </section>
  );
}
