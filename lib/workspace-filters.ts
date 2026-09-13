// Pure, client-safe helpers for the workspace toolbar.
import type { WorkspaceService } from './workspace-types';

export type WorkspaceFilter = 'all' | 'unhealthy' | 'incidents';

export function matchesFilter(
  s: Pick<WorkspaceService, 'name' | 'healthStatus' | 'openIncident' | 'framework'>,
  filter: WorkspaceFilter,
  query: string
): boolean {
  if (filter === 'unhealthy' && s.healthStatus === 'healthy') return false;
  if (filter === 'incidents' && !s.openIncident) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return s.name.toLowerCase().includes(q) || (s.framework ?? '').toLowerCase().includes(q);
}

// Best match for "search → Enter": exact name, then prefix, then substring.
export function bestMatch<T extends { name: string }>(services: T[], query: string): T | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    services.find((s) => s.name.toLowerCase() === q) ??
    services.find((s) => s.name.toLowerCase().startsWith(q)) ??
    services.find((s) => s.name.toLowerCase().includes(q)) ??
    null
  );
}

export function formatUptime(ratio: number | null): string {
  if (ratio == null) return '—';
  const pct = ratio * 100;
  return `${pct >= 99.95 ? '100' : pct.toFixed(pct >= 99 ? 2 : 1)}%`;
}
