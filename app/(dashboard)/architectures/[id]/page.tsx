import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { visibleTo } from '@/lib/access';
import { atLeast, getRole } from '@/lib/membership';
import { loadWorkspace } from '@/lib/workspace';
import { ArchitectureWorkspace } from '@/components/workspace/architecture-workspace';

export const dynamic = 'force-dynamic';

// The architecture home is the live workspace: topology, incidents, on-call, activity.
export default async function ArchitectureWorkspacePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const arch = await prisma.architecture.findFirst({ where: { id: params.id, ...visibleTo(session.user.id) }, select: { id: true } });
  if (!arch) notFound();

  const role = await getRole(arch.id, session.user.id);
  const data = await loadWorkspace(arch.id);
  return (
    <div className="h-[calc(100vh-12rem)] min-h-[640px]">
      <ArchitectureWorkspace
        initial={data}
        canEdit={atLeast(role, 'editor') && !data.architecture.demo}
        canOwn={atLeast(role, 'owner') && !data.architecture.demo}
      />
    </div>
  );
}
