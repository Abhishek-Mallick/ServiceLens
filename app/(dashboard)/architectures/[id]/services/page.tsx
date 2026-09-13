import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { AddServiceButton } from '@/components/architecture/add-service-button';
import { parseJson } from '@/lib/utils';
import { GitBranch, Server } from 'lucide-react';
import { visibleTo } from '@/lib/access';
import { atLeast, getRole } from '@/lib/membership';
import { ApiKeysPanel } from '@/components/architecture/api-keys-panel';
import { DependencyReview } from '@/components/architecture/dependency-review';
import { GithubPanel } from '@/components/architecture/github-panel';
import { loadDependencyReview } from '@/lib/topology/insights';
import { githubAppConfigured, installUrl, repoCoverage } from '@/lib/github/app';

export const dynamic = 'force-dynamic';

export default async function ServicesListPage({ params, searchParams }: { params: { id: string }; searchParams?: { github?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, ...visibleTo(session.user.id) },
    include: { services: { orderBy: { createdAt: 'asc' } } },
  });
  if (!architecture) notFound();
  const role = await getRole(architecture.id, session.user.id);
  const canEdit = atLeast(role, 'editor');
  const canOwn = atLeast(role, 'owner') && !architecture.demo;
  const apiKeys = canOwn
    ? await prisma.apiKey.findMany({
        where: { architectureId: architecture.id },
        select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const review = architecture.demo ? null : await loadDependencyReview(architecture.id);
  const showGithub = !architecture.demo && canEdit;
  const coverage = showGithub ? await repoCoverage(architecture.services.map((s) => s.repoUrl)) : [];
  const ghInstallUrl = showGithub && githubAppConfigured() ? (await installUrl(architecture.id)) ?? null : null;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Services ({architecture.services.length})</h2>
        {canEdit && <AddServiceButton architectureId={architecture.id} />}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {architecture.services.map((s) => {
          const produces = parseJson<unknown[]>(s.producesEvents, []).length;
          const consumes = parseJson<unknown[]>(s.consumesEvents, []).length;
          const apis = parseJson<unknown[]>(s.exposesApis, []).length;
          return (
            <Link key={s.id} href={`/architectures/${architecture.id}/services/${s.id}`}>
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Server className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{s.framework ?? s.language ?? '—'}</div>
                      </div>
                    </div>
                    <StatusBadge status={s.healthStatus} />
                  </div>
                  {s.summary && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{s.summary}</p>}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{apis} APIs</span>
                    <span>·</span>
                    <span>{produces} emits</span>
                    <span>·</span>
                    <span>{consumes} subs</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-2 truncate">
                    <GitBranch className="h-3 w-3" /> <span className="truncate">{s.repoUrl}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {review && (
        <DependencyReview
          architectureId={architecture.id}
          canEdit={canEdit}
          services={architecture.services.map((s) => ({ id: s.id, name: s.name }))}
          initial={review}
        />
      )}
      {showGithub && (
        <GithubPanel
          configured={githubAppConfigured()}
          installUrl={ghInstallUrl}
          justChanged={searchParams?.github ?? null}
          repos={coverage.map((c) => ({ ...c, services: architecture.services.filter((s) => s.repoUrl === c.repoUrl).map((s) => s.name) }))}
        />
      )}
      {canOwn && (
        <ApiKeysPanel
          architectureId={architecture.id}
          appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
          initialKeys={apiKeys.map((k) => ({
            ...k,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            revokedAt: k.revokedAt?.toISOString() ?? null,
          }))}
        />
      )}
    </div>
  );
}
