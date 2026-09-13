import { NextResponse } from 'next/server';
import { demoOnlyResponse } from '@/lib/demo';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { generateForArchitecture } from '@/lib/log-generator';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'editor');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!arch.demo) return demoOnlyResponse('Synthetic log generation');
  const res = await generateForArchitecture(params.id, 600, 40);
  return NextResponse.json(res);
}
