import { NextResponse } from 'next/server';
import { requireSession, requireOwnedIncident } from '@/lib/auth-helpers';
import { generateFixPr, loadLatestFixPr } from '@/lib/fix-pr';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const fix = await loadLatestFixPr(params.incidentId);
  return NextResponse.json({ fix });
}

export async function POST(_req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const fix = await generateFixPr(params.incidentId);
    return NextResponse.json({ fix });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'fix-pr generation failed' }, { status: 500 });
  }
}
