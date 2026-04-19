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

export const dynamic = 'force-dynamic';

export default async function ServicesListPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { services: { orderBy: { createdAt: 'asc' } } },
  });
  if (!architecture) notFound();

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Services ({architecture.services.length})</h2>
        <AddServiceButton architectureId={architecture.id} />
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
    </div>
  );
}
