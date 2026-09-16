'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { ServiceHealthData } from './health-dashboard';
import { formatRelative } from '@/lib/utils';

export function AlertsPanel({ services }: { services: ServiceHealthData[] }) {
  const alerts = services
    .filter((s) => s.healthStatus === 'down' || s.healthStatus === 'degraded')
    .map((s) => ({
      id: s.id,
      name: s.name,
      status: s.healthStatus,
      since: s.lastHealthCheck,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-orange-500" /> Active alerts
        </CardTitle>
        <CardDescription>{alerts.length} incidents</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {alerts.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-2" />
            <div className="text-sm font-medium">All clear</div>
            <div className="text-xs text-muted-foreground">Every service is healthy.</div>
          </div>
        )}
        {alerts.map((a) => (
          <div key={a.id} className="rounded-md border border-border/50 p-3">
            <div className="flex items-center gap-2">
              {a.status === 'down' ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              )}
              <div className="text-sm font-medium">{a.name}</div>
            </div>
            <div className="text-xs text-muted-foreground mt-1 capitalize">{a.status} · {formatRelative(a.since)}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
