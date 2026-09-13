import { NextResponse } from 'next/server';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { analyzeArchitecture } from '@/lib/analyze';
import { record, context } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Re-ingests every service's repo and re-derives the topology from contracts.
// Idempotent — safe to run after every push.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const architecture = await requireOwnedArchitecture(params.id, session.user.id, 'editor');
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { serviceIds?: string[] };
  const result = await analyzeArchitecture(params.id, { serviceIds: body.serviceIds });
  void record({
    action: 'service.analyze',
    architectureId: params.id,
    userId: session.user.id,
    targetType: 'architecture',
    targetId: params.id,
    payload: { analyzed: result.analyzed, failed: result.failed.length, edges: result.edges },
    ...context(req),
  });
  return NextResponse.json({ ok: result.failed.length === 0, ...result });
}
