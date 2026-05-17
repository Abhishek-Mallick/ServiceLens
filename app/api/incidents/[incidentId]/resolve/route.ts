import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, requireOwnedIncident } from '@/lib/auth-helpers';
import { resolveIncident } from '@/lib/incidents';

const Input = z.object({ resolution: z.string().optional() });

export async function POST(req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = Input.parse(await req.json().catch(() => ({})));
  await resolveIncident(params.incidentId, session.user.id, body.resolution);
  return NextResponse.json({ ok: true });
}
