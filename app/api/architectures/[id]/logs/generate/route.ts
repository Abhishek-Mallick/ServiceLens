import { NextResponse } from 'next/server';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { generateForArchitecture } from '@/lib/log-generator';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = await generateForArchitecture(params.id, 600, 40);
  return NextResponse.json(res);
}
