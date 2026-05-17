import { NextResponse } from 'next/server';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { search, type LogLevel } from '@/lib/logs';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const serviceIds = url.searchParams.getAll('service').filter(Boolean);
  const levels = url.searchParams.getAll('level').filter((l): l is LogLevel => LEVELS.includes(l as LogLevel));
  const q = url.searchParams.get('q');
  const sinceMin = Number(url.searchParams.get('sinceMin') ?? '60');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '200'), 1000);

  const logs = await search({
    architectureId: params.id,
    serviceIds: serviceIds.length ? serviceIds : undefined,
    levels: levels.length ? levels : undefined,
    query: q,
    since: new Date(Date.now() - sinceMin * 60 * 1000),
    limit,
  });
  return NextResponse.json({ logs });
}
