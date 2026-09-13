import { NextResponse } from 'next/server';
import { requireSession, requireOwnedIncident } from '@/lib/auth-helpers';
import { openFixPr, RemediationError } from '@/lib/remediation';
import { record, context } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Open the generated fix as a draft pull request on the service's repository.
// Explicit editor action; auto mode (Architecture.autoFixPr) calls the same code.
export async function POST(req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id, 'editor');
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const startedAt = new Date();
  try {
    const remediation = await openFixPr(params.incidentId, { byUserId: session.user.id });
    void record({ action: 'incident.fix_pr', architectureId: owned.architectureId, userId: session.user.id, targetType: 'incident', targetId: params.incidentId, payload: { prUrl: remediation.prUrl }, ...context(req) });
    // 200 when this incident already had a PR (idempotent), 201 when one was just opened.
    return NextResponse.json({ remediation }, { status: remediation.createdAt < startedAt ? 200 : 201 });
  } catch (err) {
    if (err instanceof RemediationError) {
      return NextResponse.json({ error: err.message, code: err.code, installUrl: err.installUrl ?? null }, { status: err.status });
    }
    console.error('[fix-pr/open] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed to open PR' }, { status: 500 });
  }
}
