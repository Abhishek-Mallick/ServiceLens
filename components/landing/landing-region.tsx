import { Globe, MapPin, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const columns = [
  {
    icon: Globe,
    title: 'Observe everywhere',
    body:
      'Health checks, logs, and dependency edges across every service in your architecture—mapped automatically from GitHub repos.',
  },
  {
    icon: MapPin,
    title: 'Trace anywhere',
    body:
      'See how requests flow through your mesh, which env vars wire services together, and where latency or failures cluster.',
  },
  {
    icon: Layers,
    title: 'Operate at scale',
    body:
      'Alert rules, on-call paging, regression runs, and incident timelines in one place—no more capacity planning for observability.',
  },
];

export function LandingRegion() {
  return (
    <section id="observability" className="border-b border-border/60 px-6 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Region: Your stack</h2>
        <p className="mt-4 text-lg text-muted-foreground">
          One smart mesh for workloads and signals — close to your code, close to your incidents.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-3">
        {columns.map((col) => (
          <Card key={col.title}>
            <CardContent className="p-6">
              <col.icon className="size-7 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">{col.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{col.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
