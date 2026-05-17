import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LogsViewer } from '@/components/logs/logs-viewer';

export const dynamic = 'force-dynamic';

export default async function LogsPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const arch = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!arch) notFound();

  const services = await prisma.service.findMany({
    where: { architectureId: params.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Logs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Search and tail logs across services. Ingest from your own services via <code className="text-[11px]">POST /api/services/:id/logs</code> with the service bearer token (see Service detail → Logs ingestion).
        </p>
      </div>
      <LogsViewer architectureId={params.id} services={services} />
    </div>
  );
}
