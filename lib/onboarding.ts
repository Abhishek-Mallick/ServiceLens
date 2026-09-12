// Single path for registering and updating services on a real architecture.
// Used by the onboarding wizard, "Add service", and the service settings API
// (and later by API-key self-registration) so validation and monitoring
// defaults are applied identically everywhere.

import { z } from 'zod';
import { prisma } from './prisma';
import { parseRepoUrl } from './ingest/github-client';
import { ensureDefaultProbe, ensureDefaultRules } from './monitoring/defaults';
import { checkPublicUrl } from './net-guard';

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'must start with http:// or https://');

export const ServiceInput = z.object({
  name: z.string().trim().min(1).max(120),
  repoUrl: z
    .string()
    .trim()
    .refine((u) => parseRepoUrl(u) != null, 'must be a GitHub repository URL like https://github.com/org/repo'),
  branch: z.string().trim().min(1).max(200).default('main'),
  deployedUrl: httpUrl.optional().nullable().or(z.literal('').transform(() => null)),
  healthPath: z.string().trim().max(300).default('/health'),
  provider: z.enum(['github', 'bitbucket_soon', 'gitlab_soon']).default('github'),
});
export type ServiceInputT = z.infer<typeof ServiceInput>;

export const ServicePatch = ServiceInput.partial().omit({ provider: true });

export class OnboardingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function normaliseHealthPath(p: string | undefined): string {
  const v = (p ?? '/health').trim() || '/health';
  return v.startsWith('/') ? v : `/${v}`;
}

async function assertReachableUrl(deployedUrl: string | null | undefined) {
  if (!deployedUrl) return;
  const problem = await checkPublicUrl(deployedUrl);
  if (problem) throw new OnboardingError(`Deployed URL rejected: ${problem}. ServiceLens can only monitor publicly reachable services (self-hosters: set ALLOW_PRIVATE_PROBES=1).`);
}

export async function createService(architectureId: string, input: ServiceInputT) {
  if (input.provider !== 'github') {
    throw new OnboardingError(`Provider ${input.provider} is not supported yet — coming soon.`);
  }
  await assertReachableUrl(input.deployedUrl);
  const dupe = await prisma.service.findFirst({
    where: { architectureId, name: { equals: input.name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (dupe) throw new OnboardingError(`A service named "${input.name}" already exists in this architecture.`, 409);

  const service = await prisma.service.create({
    data: {
      architectureId,
      name: input.name,
      repoUrl: input.repoUrl,
      branch: input.branch,
      provider: input.provider,
      deployedUrl: input.deployedUrl ?? null,
      healthPath: normaliseHealthPath(input.healthPath),
      analysisStatus: 'pending',
      healthStatus: 'unknown',
      simulated: false,
    },
  });
  await ensureDefaultProbe(service.id);
  await ensureDefaultRules(architectureId);
  return service;
}

export async function updateService(serviceId: string, patch: z.infer<typeof ServicePatch>) {
  const current = await prisma.service.findUnique({ where: { id: serviceId }, select: { id: true, architectureId: true, name: true } });
  if (!current) throw new OnboardingError('Service not found', 404);

  if (patch.name && patch.name.toLowerCase() !== current.name.toLowerCase()) {
    const dupe = await prisma.service.findFirst({
      where: { architectureId: current.architectureId, name: { equals: patch.name, mode: 'insensitive' }, id: { not: serviceId } },
      select: { id: true },
    });
    if (dupe) throw new OnboardingError(`A service named "${patch.name}" already exists in this architecture.`, 409);
  }

  if (patch.deployedUrl !== undefined) await assertReachableUrl(patch.deployedUrl);

  const repoChanged = patch.repoUrl !== undefined || patch.branch !== undefined;
  const service = await prisma.service.update({
    where: { id: serviceId },
    data: {
      name: patch.name,
      repoUrl: patch.repoUrl,
      branch: patch.branch,
      deployedUrl: patch.deployedUrl === undefined ? undefined : patch.deployedUrl,
      healthPath: patch.healthPath === undefined ? undefined : normaliseHealthPath(patch.healthPath),
      // A new repo/branch invalidates the extracted contract.
      ...(repoChanged ? { analysisStatus: 'pending' } : {}),
    },
  });
  await ensureDefaultProbe(serviceId);
  return service;
}
