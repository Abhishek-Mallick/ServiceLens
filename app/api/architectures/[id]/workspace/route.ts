import { NextResponse } from 'next/server';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { loadWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

// Everything the architecture workspace renders: graph, per-service health
// numbers, open incidents, on-call, recent activity.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await loadWorkspace(params.id));
}
