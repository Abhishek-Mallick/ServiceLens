import { NextResponse } from 'next/server';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { listForArchitecture } from '@/lib/audit';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 500);
  const events = await listForArchitecture(params.id, limit);
  return NextResponse.json({ events });
}
