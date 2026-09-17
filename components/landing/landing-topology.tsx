import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { buildTopology } from '@/lib/topology-builder';
import { parseJson } from '@/lib/utils';
import type { TopologyGraph } from '@/lib/types';
import { TopologyPreview } from '@/components/dashboard/topology-preview';
import { LandingFlickerCard } from '@/components/landing/landing-flicker-card';
import { GitBranch, Radar, Search } from 'lucide-react';

const steps = [
  {
    icon: GitBranch,
    title: 'Read your repos',
    body: 'Point ServiceLens at your GitHub org. It walks each repo, parses the code, and extracts every exposed endpoint, outbound HTTP call, event topic, and datastore.',
  },
  {
    icon: Radar,
    title: 'Correlate signals',
    body: 'Endpoints match callers, producers match consumers, env-var URLs match services. Ambiguous edges are marked so nothing is silently guessed.',
  },
  {
    icon: Search,
    title: 'Render the mesh',
    body: 'Every downstream dependency — REST, gRPC, events, Kafka topics, databases — becomes a live edge, checked every minute against real health probes.',
  },
];

export async function LandingTopology() {
  const arch = await prisma.architecture.findFirst({
    where: { demo: true },
    include: { services: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (!arch || arch.services.length === 0) return null;

  const cached = parseJson<TopologyGraph>(arch.topologyData, { nodes: [], edges: [] });
  const graph = cached.nodes.length ? cached : buildTopology(arch.services).graph;
  const services = arch.services.map((s) => ({
    id: s.id,
    name: s.name,
    framework: s.framework,
    language: s.language,
    healthStatus: s.healthStatus,
  }));

  return (
    <section id="observability" className="border-b border-border/60 px-6 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-4xl text-center">
      <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight md:text-6xl font-heading">
          Downstream topology, discovered from your code
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          No manual diagrams. ServiceLens reads your repositories, resolves every downstream call,
          and renders the live mesh — including the ambiguities.
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-6xl">
        <TopologyPreview
          architectureId={arch.id}
          architectureName={`${arch.name} — discovered from ${arch.services.length} services`}
          graph={graph}
          services={services}
          height={420}
        />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Live topology of the ServiceLens demo architecture — a 10-service retail mesh built from
          the microservices-demo repositories.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <LandingFlickerCard key={step.title}>
            <step.icon className="size-6 text-muted-foreground" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </LandingFlickerCard>
        ))}
      </div>

      <div className="mx-auto mt-10 flex max-w-4xl items-center justify-center gap-2 text-sm text-muted-foreground">
        <span>Want to see it end-to-end?</span>
        <Link href="/register" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
          Onboard your own architecture
        </Link>
      </div>
    </section>
  );
}
