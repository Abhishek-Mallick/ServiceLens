import { prisma } from '@/lib/prisma';
import { stringify } from '@/lib/utils';
import type { ServiceContract } from './types';

export async function saveContract(serviceId: string, contract: ServiceContract): Promise<void> {
  await prisma.serviceContract.upsert({
    where: { serviceId },
    create: {
      serviceId,
      endpoints: stringify(contract.endpoints),
      outboundDeps: stringify(contract.outboundDeps),
      envVars: stringify(contract.envVars),
      framework: contract.framework,
      commitSha: contract.commitSha,
    },
    update: {
      endpoints: stringify(contract.endpoints),
      outboundDeps: stringify(contract.outboundDeps),
      envVars: stringify(contract.envVars),
      framework: contract.framework,
      commitSha: contract.commitSha,
      extractedAt: new Date(),
    },
  });

  await prisma.service.update({
    where: { id: serviceId },
    data: {
      framework: contract.framework === 'unknown' ? null : contract.framework,
      // Same {method, path, description} shape the UI panels already render.
      // consumesApis is written by deriveContractTopology once targets are resolved.
      exposesApis: stringify(contract.endpoints.map((e) => ({ method: e.method, path: e.path, description: `${e.file}:${e.line}` }))),
      analysisStatus: 'completed',
      analysisResult: null,
    },
  });
}
