import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/shared/status-badge';
import { ArchitectureTabs } from '@/components/architecture/architecture-tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default async function ArchitectureLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { _count: { select: { services: true, regressionRuns: true } } },
  });
  if (!architecture) notFound();

  return (
    <div className="flex flex-col">
      <div className="border-b border-border/60 bg-background/50">
        <div className="px-6 lg:px-8 pt-6 pb-4">
          <Link href="/architectures" className="text-xs text-muted-foreground inline-flex items-center gap-1 mb-3 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Architectures
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold truncate">{architecture.name}</h1>
                <StatusBadge status={architecture.status} />
              </div>
              {architecture.description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{architecture.description}</p>}
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                <span>{architecture._count.services} services</span>
                <span>·</span>
                <span>{architecture._count.regressionRuns} runs</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/architectures/${architecture.id}/regression`}>Run regression</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/architectures/${architecture.id}/topology`}>Open topology</Link>
              </Button>
            </div>
          </div>
          <ArchitectureTabs architectureId={architecture.id} />
        </div>
      </div>
      {children}
    </div>
  );
}
