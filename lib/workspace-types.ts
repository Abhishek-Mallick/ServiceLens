// Client-safe shapes for the architecture workspace (no server imports here).
import type { TopologyGraph } from './types';

export interface WorkspaceService {
  id: string;
  name: string;
  framework: string | null;
  language: string | null;
  healthStatus: string;
  lastHealthCheck: string | null;
  deployedUrl: string | null;
  repoUrl: string;
  commitSha: string | null;
  analysisStatus: string;
  simulated: boolean;
  uptime24h: number | null; // share of checks in the last 24 h that weren't down
  p95Ms: number | null; // p95 check latency over the last hour
  checks24h: number;
  openIncident: { id: string; title: string; severity: string; status: string } | null;
  oncall: { name: string; email: string } | null;
}

export interface WorkspaceIncident {
  id: string;
  title: string;
  severity: string;
  status: string;
  openedAt: string;
  service: { id: string; name: string } | null;
  oncall: { name: string; email: string } | null;
  fixPr: { url: string | null; state: string | null } | null;
}

export type ActivityKind = 'incident' | 'fix' | 'service' | 'analysis' | 'topology' | 'tests' | 'oncall' | 'health';

export interface ActivityItem {
  id: string;
  at: string; // ISO
  kind: ActivityKind;
  title: string;
  detail?: string | null;
  href?: string | null;
  severity?: string | null;
}

export interface OncallPerson {
  name: string;
  email: string;
  services: string[];
}

export interface WorkspaceData {
  architecture: { id: string; name: string; demo: boolean };
  graph: TopologyGraph;
  services: WorkspaceService[];
  incidents: WorkspaceIncident[];
  activity: ActivityItem[];
  oncall: { configured: boolean; people: OncallPerson[] };
  counts: { healthy: number; degraded: number; down: number; unknown: number };
}

export interface ServiceOverview {
  service: {
    id: string;
    name: string;
    framework: string | null;
    language: string | null;
    healthStatus: string;
    lastHealthCheck: string | null;
    deployedUrl: string | null;
    healthPath: string;
    repoUrl: string;
    branch: string;
    analysisStatus: string;
    simulated: boolean;
    heartbeatAt: string | null;
  };
  stats: { uptime24h: number | null; p95Ms: number | null; checks24h: number };
  history: Array<{ status: string; rt: number | null; at: string }>;
  probes: Array<{ id: string; name: string; type: string; target: string; intervalSec: number; enabled: boolean; lastRunAt: string | null; lastStatus: string | null }>;
  dependsOn: Array<{ id: string; name: string; healthStatus: string; via: string | null }>;
  usedBy: Array<{ id: string; name: string; healthStatus: string; via: string | null }>;
  endpoints: { count: number; sample: Array<{ method: string; path: string }> };
  incident: { id: string; title: string; severity: string; status: string; openedAt: string; rcaExcerpt: string | null; fixPrUrl: string | null } | null;
  oncall: { name: string; email: string } | null;
  logs: Array<{ id: string; level: string; message: string; at: string }>;
  canEdit: boolean;
}
