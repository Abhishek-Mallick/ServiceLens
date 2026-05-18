import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, requireOwnedIncident } from '@/lib/auth-helpers';
import { resolveIncident } from '@/lib/incidents';
import { record, context } from '@/lib/audit';

const Input = z.object({ resolution: z.string().optional() });

export async function POST(req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id, 'editor');
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = Input.parse(await req.json().catch(() => ({})));
  await resolveIncident(params.incidentId, session.user.id, body.resolution);
  void record({
    action: 'incident.resolve',
    architectureId: owned.architectureId,
    userId: session.user.id,
    targetType: 'incident',
    targetId: params.incidentId,
    payload: body.resolution ? { resolution: body.resolution.slice(0, 200) } : null,
    ...context(req),
  });
  return NextResponse.json({ ok: true });
}
