// Analyze an architecture: ingest every service's repo via the GitHub Contents
// API, persist its ServiceContract, then derive the topology from contracts.
// Demo architectures keep the legacy seeded analysis and never hit GitHub.

import { prisma, readBatch } from './prisma';
import { parseJson, stringify } from './utils';
import { ingestService } from './ingest/ingest-service';
import { saveContract } from './ingest/persist';
import type { OutboundDep } from './ingest/types';
import { buildTopology } from './topology-builder';
import { buildTopologyFromContracts, type ContractTopology } from './topology/from-contracts';
import { publish } from './realtime';
import { readTokenForRepo } from './github/app';

export interface AnalyzeResult {
  analyzed: number;
  failed: Array<{ serviceId: string; name: string; error: string }>;
  edges: number;
  ambiguous: ContractTopology['ambiguous'];
  unresolved: ContractTopology['unresolved'];
}

export async function analyzeArchitecture(architectureId: string, opts: { serviceIds?: string[] } = {}): Promise<AnalyzeResult> {
  const architecture = await prisma.architecture.findUnique({
    where: { id: architectureId },
    include: { services: true },
  });
  if (!architecture) throw new Error('architecture not found');

  const result: AnalyzeResult = { analyzed: 0, failed: [], edges: 0, ambiguous: [], unresolved: [] };
  await prisma.architecture.update({ where: { id: architectureId }, data: { status: 'analyzing' } });

  try {
    if (architecture.demo) {
      const { graph, dependencies } = buildTopology(architecture.services);
      await replaceDependencies(architectureId, dependencies);
      await prisma.architecture.update({ where: { id: architectureId }, data: { status: 'ready', topologyData: stringify(graph) } });
      result.edges = dependencies.length;
      return result;
    }

    const targets = opts.serviceIds
      ? architecture.services.filter((s) => opts.serviceIds!.includes(s.id))
      : architecture.services;

    for (const svc of targets) {
      try {
        await prisma.service.update({ where: { id: svc.id }, data: { analysisStatus: 'analyzing' } });
        const contract = await ingestService({ repoUrl: svc.repoUrl, branch: svc.branch, githubToken: await readTokenForRepo(svc.repoUrl) });
        await saveContract(svc.id, contract);
        if (contract.branch && contract.branch !== svc.branch) {
          await prisma.service.update({ where: { id: svc.id }, data: { branch: contract.branch } });
        }
        result.analyzed++;
      } catch (err) {
        const message = describeIngestError(err);
        result.failed.push({ serviceId: svc.id, name: svc.name, error: message });
        await prisma.service.update({
          where: { id: svc.id },
          data: { analysisStatus: 'error', analysisResult: stringify({ error: message }) },
        });
      }
    }

    const topo = await deriveContractTopology(architectureId);
    result.edges = topo.dependencies.length;
    result.ambiguous = topo.ambiguous;
    result.unresolved = topo.unresolved;

    const allFailed = targets.length > 0 && result.failed.length === targets.length;
    await prisma.architecture.update({
      where: { id: architectureId },
      data: { status: allFailed ? 'error' : 'ready', topologyData: stringify(topo.graph) },
    });
    return result;
  } catch (err) {
    await prisma.architecture.update({ where: { id: architectureId }, data: { status: 'error' } });
    throw err;
  } finally {
    publish(architectureId, 'health', { analyzed: true });
  }
}

// Contracts + human edge decisions → topology (pure read, no writes).
export async function computeContractTopology(architectureId: string) {
  const [services, overrides] = await readBatch([
    prisma.service.findMany({
      where: { architectureId },
      include: { contract: { select: { outboundDeps: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.edgeOverride.findMany({ where: { architectureId }, orderBy: { createdAt: 'asc' } }),
  ]);
  const topo = buildTopologyFromContracts(
    services.map((s) => ({
      id: s.id,
      name: s.name,
      deployedUrl: s.deployedUrl,
      healthStatus: s.healthStatus,
      framework: s.framework,
      language: s.language,
      summary: s.summary,
      outboundDeps: parseJson<OutboundDep[]>(s.contract?.outboundDeps, []),
    })),
    overrides.map((o) => ({ fromServiceId: o.fromServiceId, toServiceId: o.toServiceId, envVar: o.envVar, action: o.action }))
  );
  return { services, overrides, topo };
}

// Rebuild edges from whatever contracts exist. Also called when a service is
// added or removed so the graph never references stale nodes.
export async function deriveContractTopology(architectureId: string): Promise<ContractTopology> {
  const { services, topo } = await computeContractTopology(architectureId);
  await replaceDependencies(architectureId, topo.dependencies);

  // Mirror resolved calls onto Service.consumesApis ({service, method, path})
  // so existing service/topology panels render them.
  const nameById = new Map(services.map((s) => [s.id, s.name]));
  for (const s of services) {
    const calls = topo.dependencies
      .filter((d) => d.dependentId === s.id)
      .map((d) => ({ service: nameById.get(d.dependencyId) ?? '', method: 'HTTP', path: String(d.details.envVar ?? '') }));
    await prisma.service.update({ where: { id: s.id }, data: { consumesApis: stringify(calls) } });
  }
  await prisma.architecture.update({ where: { id: architectureId }, data: { topologyData: stringify(topo.graph) } });
  return topo;
}

async function replaceDependencies(
  architectureId: string,
  deps: Array<{ dependentId: string; dependencyId: string; type: string; details: Record<string, unknown> }>
) {
  await prisma.$transaction([
    prisma.serviceDependency.deleteMany({ where: { dependent: { architectureId } } }),
    prisma.serviceDependency.createMany({
      data: deps.map((d) => ({ dependentId: d.dependentId, dependencyId: d.dependencyId, type: d.type, details: stringify(d.details) })),
      skipDuplicates: true,
    }),
  ]);
}

function describeIngestError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  if (e?.status === 404) return 'Repository or branch not found. For a private repo, install the ServiceLens GitHub App on it (or set GITHUB_TOKEN).';
  if (e?.status === 403 || e?.status === 429) return 'GitHub API rate limit hit. Set GITHUB_TOKEN to raise the limit from 60 to 5,000 requests/hour.';
  if (e?.status === 401) return 'GITHUB_TOKEN was rejected by GitHub.';
  return e?.message ?? 'unknown error';
}
