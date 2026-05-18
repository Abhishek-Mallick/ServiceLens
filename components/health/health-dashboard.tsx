'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { ServiceHealthCard } from './service-health-card';
import { AlertsPanel } from './alerts-panel';
import { HealthTimeline } from './health-timeline';
import { RefreshCw, Activity, Radio } from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import { useArchitectureEvents } from '@/lib/hooks/use-architecture-events';

export interface HealthEntry {
  status: string;
  responseTime: number | null;
  checkedAt: string;
}

export interface ServiceHealthData {
  id: string;
  name: string;
  framework: string | null;
  language: string | null;
  healthStatus: string;
  healthEndpoint: string | null;
  lastHealthCheck: string | null;
  simulated: boolean;
  history: HealthEntry[];
}

export function HealthDashboard({ architectureId, initialServices }: { architectureId: string; initialServices: ServiceHealthData[] }) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  // Realtime: subscribe to per-arch SSE. Patch the status optimistically on
  // every `health` event so the cards flip without waiting for the next probe.
  useArchitectureEvents(architectureId, (ev) => {
    if (ev.kind === 'hello') { setLive(true); return; }
    if (ev.kind === 'ping') return;
    if (ev.kind === 'health') {
      const { serviceId, status, rt } = ev.payload as { serviceId: string; status: string; rt: number | null };
      setServices((prev) => prev.map((s) =>
        s.id === serviceId
          ? { ...s, healthStatus: status, lastHealthCheck: new Date(ev.at).toISOString(), history: [...s.history, { status, responseTime: rt, checkedAt: new Date(ev.at).toISOString() }].slice(-96) }
          : s
      ));
    }
  });

  const totals = useMemo(() => {
    const counts = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
    services.forEach((s) => {
      const k = (s.healthStatus as keyof typeof counts) in counts ? (s.healthStatus as keyof typeof counts) : 'unknown';
      counts[k] += 1;
    });
    return counts;
  }, [services]);

  useEffect(() => {
    const interval = setInterval(() => {
      refresh(false);
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [architectureId]);

  async function refresh(userTriggered: boolean) {
    if (userTriggered) setRefreshing(true);
    try {
      const probeRes = await fetch(`/api/architectures/${architectureId}/health`, { method: 'POST' });
      if (!probeRes.ok) throw new Error('probe failed');
      const dataRes = await fetch(`/api/architectures/${architectureId}/health`);
      const data = await dataRes.json();
      const updated: ServiceHealthData[] = data.architecture.services.map((s: {
        id: string;
        name: string;
        framework: string | null;
        language: string | null;
        healthStatus: string;
        healthEndpoint: string | null;
        lastHealthCheck: string | null;
        simulated?: boolean;
        healthHistory: Array<{ status: string; responseTime: number | null; checkedAt: string }>;
      }) => ({
        id: s.id,
        name: s.name,
        framework: s.framework,
        language: s.language,
        healthStatus: s.healthStatus,
        healthEndpoint: s.healthEndpoint,
        lastHealthCheck: s.lastHealthCheck,
        simulated: s.simulated ?? false,
        history: (s.healthHistory ?? []).slice().reverse(),
      }));
      setServices(updated);
      if (userTriggered) toast.success('Health refreshed');
    } catch {
      if (userTriggered) toast.error('Refresh failed');
    } finally {
      if (userTriggered) setRefreshing(false);
    }
  }

  const selectedService = services.find((s) => s.id === selected) ?? null;
  const latestCheck = services
    .map((s) => s.lastHealthCheck ? new Date(s.lastHealthCheck).getTime() : 0)
    .reduce((a, b) => Math.max(a, b), 0);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-success" />
          <div>
            <div className="text-sm">
              <span className="font-semibold text-success">{totals.healthy}</span>
              <span className="text-muted-foreground">/{services.length} services healthy</span>
              {totals.degraded > 0 && <span className="ml-2 text-warning">· {totals.degraded} degraded</span>}
              {totals.down > 0 && <span className="ml-2 text-destructive">· {totals.down} down</span>}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              Last checked: {latestCheck ? formatRelative(new Date(latestCheck)) : 'never'} · polling every 30s
              {live && (
                <span className="inline-flex items-center gap-1 text-accent-green">
                  <Radio className="h-3 w-3 animate-pulse" /> live
                </span>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <ServiceHealthCard
              key={s.id}
              service={s}
              selected={selected === s.id}
              onClick={() => setSelected(s.id === selected ? null : s.id)}
            />
          ))}
        </div>
        <AlertsPanel services={services} />
      </div>

      {selectedService && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selectedService.name} · full timeline
              <StatusBadge status={selectedService.healthStatus} />
            </CardTitle>
            <CardDescription>
              Last {selectedService.history.length} checks · {selectedService.healthEndpoint ?? 'simulated probe'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HealthTimeline history={selectedService.history} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
