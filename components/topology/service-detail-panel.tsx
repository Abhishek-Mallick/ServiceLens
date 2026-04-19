'use client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ServiceLike {
  id: string;
  name: string;
  framework: string | null;
  language: string | null;
  summary: string | null;
  healthStatus: string;
  producesEvents: unknown[];
  consumesEvents: unknown[];
  exposesApis: unknown[];
  consumesApis: unknown[];
  databases: unknown[];
}

export function ServiceDetailPanel({ service, onClose }: { service: ServiceLike | null; onClose: () => void }) {
  const open = !!service;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto scrollbar-thin">
        {service && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>{service.name}</SheetTitle>
                <StatusBadge status={service.healthStatus} />
              </div>
              <SheetDescription>{service.framework ?? service.language ?? '—'}</SheetDescription>
            </SheetHeader>
            {service.summary && <p className="mt-4 text-sm text-muted-foreground">{service.summary}</p>}
            <Tabs defaultValue="events" className="mt-4">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="apis">APIs</TabsTrigger>
                <TabsTrigger value="data">Data</TabsTrigger>
              </TabsList>
              <TabsContent value="events" className="space-y-4">
                <Section title="Produces" items={service.producesEvents as Array<{ name: string; topic?: string }>} render={(e) => (
                  <div>
                    <div className="text-sm font-medium">{e.name}</div>
                    {e.topic && <div className="text-xs text-muted-foreground">topic: {e.topic}</div>}
                  </div>
                )} />
                <Section title="Consumes" items={service.consumesEvents as Array<{ name: string; topic?: string }>} render={(e) => (
                  <div>
                    <div className="text-sm font-medium">{e.name}</div>
                    {e.topic && <div className="text-xs text-muted-foreground">topic: {e.topic}</div>}
                  </div>
                )} />
              </TabsContent>
              <TabsContent value="apis" className="space-y-4">
                <Section title="Exposes" items={service.exposesApis as Array<{ method: string; path: string; description?: string }>} render={(a) => (
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{a.method}</Badge>
                      <span className="text-sm font-mono">{a.path}</span>
                    </div>
                    {a.description && <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>}
                  </div>
                )} />
                <Section title="Consumes" items={service.consumesApis as Array<{ service: string; method: string; path: string }>} render={(a) => (
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{a.method}</Badge>
                      <span className="text-sm font-mono">{a.service}{a.path}</span>
                    </div>
                  </div>
                )} />
              </TabsContent>
              <TabsContent value="data">
                <Section title="Databases" items={service.databases as Array<{ type: string; name: string }>} render={(d) => (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="uppercase">{d.type}</Badge>
                    <span className="text-sm">{d.name}</span>
                  </div>
                )} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section<T>({ title, items, render }: { title: string; items: T[]; render: (item: T) => React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">None detected.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-md border border-border/60 p-2">
              {render(it)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
