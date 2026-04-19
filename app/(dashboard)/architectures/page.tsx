import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Plus, Boxes, GitBranch } from 'lucide-react';
import { formatRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ArchitecturesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const architectures = await prisma.architecture.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { services: true, regressionRuns: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Architectures</h1>
          <p className="text-muted-foreground mt-1">Every service mesh you've registered.</p>
        </div>
        <Button asChild>
          <Link href="/architectures/new"><Plus className="h-4 w-4" /> New architecture</Link>
        </Button>
      </div>

      {architectures.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 mb-4">
              <Boxes className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No architectures yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Register your first microservice architecture by adding a Git repo per service. ServiceLens will map everything automatically.
            </p>
            <Button asChild className="mt-4"><Link href="/architectures/new">Create architecture</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {architectures.map((a) => (
            <Link key={a.id} href={`/architectures/${a.id}`} className="group">
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate group-hover:text-primary transition-colors">{a.name}</CardTitle>
                      {a.description && <CardDescription className="mt-1 line-clamp-2">{a.description}</CardDescription>}
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />{a._count.services} services</span>
                    <span>·</span>
                    <span>{a._count.regressionRuns} runs</span>
                    <span>·</span>
                    <span>{formatRelative(a.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
