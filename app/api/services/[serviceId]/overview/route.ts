import { NextResponse } from 'next/server';
import { requireSession, requireOwnedService } from '@/lib/auth-helpers';
import { atLeast, getRole } from '@/lib/membership';
import { loadServiceOverview } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

// Detail behind the workspace's service drawer.
export async function GET(_req: Request, { params }: { params: { serviceId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = await requireOwnedService(params.serviceId, session.user.id);
  if (!svc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const canEdit = atLeast(await getRole(svc.architectureId, session.user.id), 'editor');
  const overview = await loadServiceOverview(params.serviceId, canEdit);
  if (!overview) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(overview);
}
