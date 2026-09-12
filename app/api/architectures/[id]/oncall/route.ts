import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { fetchRosterCsv, parseRoster, type RosterEntry } from '@/lib/oncall/roster';
import { parseJson, stringify } from '@/lib/utils';
import { record, context } from '@/lib/audit';

const Input = z.object({
  csvUrl: z.string().trim().url(),
  escalateAfterMin: z.number().int().min(0).max(1440).default(15),
});

function shape(src: Awaited<ReturnType<typeof prisma.oncallSource.findUnique>>) {
  if (!src) return { source: null, roster: [] as RosterEntry[] };
  return {
    source: { csvUrl: src.csvUrl, escalateAfterMin: src.escalateAfterMin, lastFetchedAt: src.lastFetchedAt, lastError: src.lastError },
    roster: parseJson<RosterEntry[]>(src.rosterJson, []),
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(shape(await prisma.oncallSource.findUnique({ where: { architectureId: params.id } })));
}

// Save the directory. The sheet is fetched and parsed first so a broken URL or
// malformed sheet is reported immediately instead of at 3am.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (arch.demo) return NextResponse.json({ error: 'The demo architecture does not page anyone.' }, { status: 400 });

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  let csv: string;
  try {
    csv = await fetchRosterCsv(parsed.data.csvUrl);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not fetch the sheet' }, { status: 400 });
  }
  const roster = parseRoster(csv);
  if (roster.entries.length === 0) {
    return NextResponse.json({ error: roster.errors[0] ?? 'The sheet has no valid rows.', errors: roster.errors }, { status: 400 });
  }

  const data = {
    csvUrl: parsed.data.csvUrl,
    escalateAfterMin: parsed.data.escalateAfterMin,
    rosterJson: stringify(roster.entries),
    lastFetchedAt: new Date(),
    lastError: roster.errors.length ? roster.errors.slice(0, 5).join(' ') : null,
  };
  const src = await prisma.oncallSource.upsert({ where: { architectureId: params.id }, create: { architectureId: params.id, ...data }, update: data });
  void record({ action: 'oncall.update', architectureId: params.id, userId: session.user.id, payload: { entries: roster.entries.length }, ...context(req) });
  return NextResponse.json({ ...shape(src), warnings: roster.errors });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.oncallSource.deleteMany({ where: { architectureId: params.id } });
  void record({ action: 'oncall.update', architectureId: params.id, userId: session.user.id, payload: { removed: true }, ...context(req) });
  return NextResponse.json({ ok: true });
}
