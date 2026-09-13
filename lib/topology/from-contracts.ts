// Derive a topology graph from extracted ServiceContracts (real repos).
//
// For every outbound dependency (an env var like PRODUCT_SERVICE_URL found in
// source or .env.example) we try to resolve which sibling service it points at:
//   1. host match   — the example URL's host equals a service's deployedUrl host
//   2. name match   — env-var stem tokens ⊆ service-name tokens
//                     (PRODUCT_SERVICE_URL ↔ "ecommerce-product-service")
// Exactly one candidate → confirmed edge (persisted as ServiceDependency).
// Several candidates  → ambiguous edge (rendered dashed, not persisted).
// None                → unresolved (external dependency, surfaced in the UI).
//
// Human decisions (EdgeOverride) are applied on top, so re-analysis never
// undoes them: confirm / reject a candidate, link an env var manually, ignore
// an external one, or add a free-standing manual edge (envVar "").

import type { OutboundDep } from '@/lib/ingest/types';
import type { DetectedDependency } from '@/lib/topology-builder';
import type { TopologyEdge, TopologyGraph, TopologyNode } from '@/lib/types';

export interface ContractService {
  id: string;
  name: string;
  deployedUrl: string | null;
  healthStatus: string;
  framework: string | null;
  language: string | null;
  summary: string | null;
  outboundDeps: OutboundDep[];
}

export type EdgeAction = 'confirm' | 'reject' | 'manual' | 'ignore';

export interface EdgeOverrideInput {
  fromServiceId: string;
  toServiceId: string | null;
  envVar: string; // "" for free-standing manual edges
  action: EdgeAction | string;
}

export interface UnresolvedDep {
  serviceId: string;
  envVar: string;
  urlExample?: string;
}

export interface ContractTopology {
  graph: TopologyGraph;
  dependencies: DetectedDependency[];
  ambiguous: Array<{ serviceId: string; envVar: string; candidateIds: string[] }>;
  unresolved: UnresolvedDep[];
  ignored: Array<{ serviceId: string; envVar: string }>;
}

const ENV_SUFFIX = /_(?:BASE_URL|API_URL|URL|URI|ENDPOINT|HOST|ADDR)$/;
const GENERIC = new Set(['service', 'svc', 'api', 'base', 'internal', 'server', 'app', 'ms']);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !GENERIC.has(t));
}

export function envStemTokens(envVar: string): string[] {
  return tokens(envVar.replace(ENV_SUFFIX, ''));
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return null;
    return h;
  } catch {
    return null;
  }
}

export function resolveDep(dep: OutboundDep, self: ContractService, services: ContractService[]): string[] {
  const others = services.filter((s) => s.id !== self.id);

  const depHost = hostOf(dep.urlExample);
  if (depHost) {
    const byHost = others.filter((s) => hostOf(s.deployedUrl) === depHost);
    if (byHost.length > 0) return byHost.map((s) => s.id);
  }

  const stem = envStemTokens(dep.envVar);
  if (stem.length === 0) return [];
  const byName = others.filter((s) => {
    const nameTokens = new Set(tokens(s.name));
    return stem.every((t) => nameTokens.has(t));
  });
  return byName.map((s) => s.id);
}

export function buildTopologyFromContracts(services: ContractService[], overrides: EdgeOverrideInput[] = []): ContractTopology {
  const nodes: TopologyNode[] = services.map((svc) => ({
    id: `svc-${svc.id}`,
    type: 'service',
    label: svc.name,
    data: {
      serviceId: svc.id,
      language: svc.language,
      framework: svc.framework,
      health: svc.healthStatus,
      summary: svc.summary,
    },
  }));

  const ids = new Set(services.map((s) => s.id));
  const edges: TopologyEdge[] = [];
  const dependencies: DetectedDependency[] = [];
  const ambiguous: ContractTopology['ambiguous'] = [];
  const unresolved: UnresolvedDep[] = [];
  const ignored: ContractTopology['ignored'] = [];
  const seen = new Set<string>();

  const addEdge = (fromId: string, toId: string, envVar: string, details: Record<string, unknown>, confirmed: boolean) => {
    const key = `${fromId}->${toId}`;
    if (confirmed && !seen.has(key)) {
      seen.add(key);
      dependencies.push({ dependentId: fromId, dependencyId: toId, type: 'rest', details });
    }
    edges.push({
      id: `e-rest-${fromId}-${toId}-${envVar || 'manual'}`,
      source: `svc-${fromId}`,
      target: `svc-${toId}`,
      type: 'rest',
      label: envVar || 'manual',
      details,
    });
  };

  for (const svc of services) {
    // One env var can be referenced from several files; resolve each once.
    const byEnv = new Map<string, OutboundDep>();
    for (const d of svc.outboundDeps) if (!byEnv.has(d.envVar)) byEnv.set(d.envVar, d);

    for (const dep of Array.from(byEnv.values())) {
      const decisions = overrides.filter((o) => o.fromServiceId === svc.id && o.envVar === dep.envVar);
      if (decisions.some((o) => o.action === 'ignore')) {
        ignored.push({ serviceId: svc.id, envVar: dep.envVar });
        continue;
      }

      let candidates: string[];
      let matchedBy: 'contract' | 'confirmed' | 'manual';
      const manual = decisions.find((o) => o.action === 'manual' && o.toServiceId && ids.has(o.toServiceId) && o.toServiceId !== svc.id);
      if (manual) {
        candidates = [manual.toServiceId!];
        matchedBy = 'manual';
      } else {
        const rejected = new Set(decisions.filter((o) => o.action === 'reject').map((o) => o.toServiceId));
        candidates = resolveDep(dep, svc, services).filter((c) => !rejected.has(c));
        const confirmed = decisions.find((o) => o.action === 'confirm' && o.toServiceId && candidates.includes(o.toServiceId));
        if (confirmed) {
          candidates = [confirmed.toServiceId!];
          matchedBy = 'confirmed';
        } else {
          matchedBy = 'contract';
        }
      }

      if (candidates.length === 0) {
        unresolved.push({ serviceId: svc.id, envVar: dep.envVar, urlExample: dep.urlExample });
        continue;
      }
      const isConfirmed = candidates.length === 1;
      if (!isConfirmed) ambiguous.push({ serviceId: svc.id, envVar: dep.envVar, candidateIds: candidates });
      for (const targetId of candidates) {
        addEdge(svc.id, targetId, dep.envVar, { envVar: dep.envVar, file: dep.file, line: dep.line, matchedBy, ambiguous: !isConfirmed }, isConfirmed);
      }
    }
  }

  // Free-standing manual edges (not tied to an env var).
  for (const o of overrides) {
    if (o.action !== 'manual' || o.envVar !== '' || !o.toServiceId) continue;
    if (!ids.has(o.fromServiceId) || !ids.has(o.toServiceId) || o.fromServiceId === o.toServiceId) continue;
    if (seen.has(`${o.fromServiceId}->${o.toServiceId}`)) continue;
    addEdge(o.fromServiceId, o.toServiceId, '', { matchedBy: 'manual', ambiguous: false }, true);
  }

  return { graph: { nodes, edges }, dependencies, ambiguous, unresolved, ignored };
}
