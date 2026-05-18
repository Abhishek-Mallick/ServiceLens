import { NextResponse } from 'next/server';
import { requireSession, requireOwnedIncident } from '@/lib/auth-helpers';
import { ackIncident } from '@/lib/incidents';
import { record, context } from '@/lib/audit';

export async function POST(req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id, 'editor');
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await ackIncident(params.incidentId, session.user.id);
  void record({
    action: 'incident.ack',
    architectureId: owned.architectureId,
    userId: session.user.id,
    targetType: 'incident',
    targetId: params.incidentId,
    ...context(req),
  });
  return NextResponse.json({ ok: true });
}
