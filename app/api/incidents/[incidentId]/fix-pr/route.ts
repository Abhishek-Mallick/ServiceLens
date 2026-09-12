import { NextResponse } from 'next/server';
import { requireSession, requireOwnedIncident } from '@/lib/auth-helpers';
import { FixPrError, generateFixPr, isCommittable, loadLatestFixPr } from '@/lib/fix-pr';
import { latestRemediation } from '@/lib/remediation';
import { githubAppConfigured } from '@/lib/github/app';
import { AiUnavailableError } from '@/lib/openrouter-stream';
import { record, context } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const fix = await loadLatestFixPr(params.incidentId);
  return NextResponse.json({
    fix,
    committable: isCommittable(fix),
    remediation: await latestRemediation(params.incidentId),
    githubApp: { configured: githubAppConfigured() },
  });
}

// Generate a fix proposal from the RCA and the service's real source files.
export async function POST(req: Request, { params }: { params: { incidentId: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await requireOwnedIncident(params.incidentId, session.user.id, 'editor');
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const fix = await generateFixPr(params.incidentId);
    void record({ action: 'incident.fix_pr', architectureId: owned.architectureId, userId: session.user.id, targetType: 'incident', targetId: params.incidentId, payload: { files: fix.files.length }, ...context(req) });
    return NextResponse.json({ fix, committable: isCommittable(fix) });
  } catch (err) {
    if (err instanceof AiUnavailableError) return NextResponse.json({ error: err.message, code: `ai_${err.reason}` }, { status: 503 });
    if (err instanceof FixPrError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    const e = err as { status?: number; message?: string };
    if (e.status === 404) return NextResponse.json({ error: 'Repository or branch not found on GitHub.', code: 'repo_not_found' }, { status: 404 });
    console.error('[fix-pr] generation failed:', err);
    return NextResponse.json({ error: e.message ?? 'fix generation failed' }, { status: 500 });
  }
}
