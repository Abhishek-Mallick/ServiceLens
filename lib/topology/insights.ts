// What analysis couldn't settle on its own, shaped for the review UI:
// ambiguous env vars (several candidate services), unresolved ones (no
// onboarded service matches), and the decisions people already made.

import { parseJson } from '@/lib/utils';
import type { OutboundDep } from '@/lib/ingest/types';
import { computeContractTopology } from '@/lib/analyze';

export interface ServiceRef {
  id: string;
  name: string;
}

export interface DependencyReview {
  ambiguous: Array<{ from: ServiceRef; envVar: string; file: string | null; line: number | null; candidates: ServiceRef[] }>;
  unresolved: Array<{ from: ServiceRef; envVar: string; urlExample: string | null; file: string | null; line: number | null }>;
  decisions: Array<{ id: string; action: string; envVar: string; from: ServiceRef; to: ServiceRef | null }>;
}

export async function loadDependencyReview(architectureId: string): Promise<DependencyReview> {
  const { services, overrides, topo } = await computeContractTopology(architectureId);
  const byId = new Map(services.map((s) => [s.id, { id: s.id, name: s.name }]));
  const depOf = (serviceId: string, envVar: string) => {
    const svc = services.find((s) => s.id === serviceId);
    return parseJson<OutboundDep[]>(svc?.contract?.outboundDeps, []).find((d) => d.envVar === envVar);
  };

  return {
    ambiguous: topo.ambiguous.map((a) => {
      const dep = depOf(a.serviceId, a.envVar);
      return {
        from: byId.get(a.serviceId)!,
        envVar: a.envVar,
        file: dep?.file ?? null,
        line: dep?.line ?? null,
        candidates: a.candidateIds.map((id) => byId.get(id)!).filter(Boolean),
      };
    }),
    unresolved: topo.unresolved.map((u) => {
      const dep = depOf(u.serviceId, u.envVar);
      return { from: byId.get(u.serviceId)!, envVar: u.envVar, urlExample: u.urlExample ?? null, file: dep?.file ?? null, line: dep?.line ?? null };
    }),
    decisions: overrides
      .filter((o) => byId.has(o.fromServiceId))
      .map((o) => ({
        id: o.id,
        action: o.action,
        envVar: o.envVar,
        from: byId.get(o.fromServiceId)!,
        to: o.toServiceId ? byId.get(o.toServiceId) ?? null : null,
      })),
  };
}
