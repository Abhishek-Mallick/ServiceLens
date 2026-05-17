import { NextResponse } from 'next/server';
import { requireSession, requireOwnedIncident } from '@/lib/auth-helpers';
import { ackIncident } from '@/lib/incidents';

export async function POST(_req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await ackIncident(params.incidentId, session.user.id);
  return NextResponse.json({ ok: true });
}
