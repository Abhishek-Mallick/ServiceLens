import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { inviteMember, listMembers, removeMember, setRole, type Role } from '@/lib/membership';
import { record, context } from '@/lib/audit';

const Invite = z.object({ email: z.string().email(), role: z.enum(['owner', 'editor', 'viewer']).default('viewer') });
const Patch = z.object({ userId: z.string(), role: z.enum(['owner', 'editor', 'viewer']) });
const Delete = z.object({ userId: z.string() });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id);
  if (!arch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const members = await listMembers(params.id);
  return NextResponse.json({ members });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Owner role required' }, { status: 403 });
  const body = Invite.parse(await req.json());
  const result = await inviteMember(params.id, body.email, body.role as Role);
  if ('error' in result) return NextResponse.json(result, { status: 400 });
  void record({
    action: 'member.invite',
    architectureId: params.id,
    userId: session.user.id,
    targetType: 'member',
    targetId: result.memberId,
    payload: { email: body.email, role: body.role },
    ...context(req),
  });
  return NextResponse.json(result, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Owner role required' }, { status: 403 });
  const body = Patch.parse(await req.json());
  await setRole(params.id, body.userId, body.role as Role);
  void record({ action: 'member.role_change', architectureId: params.id, userId: session.user.id, targetType: 'member', targetId: body.userId, payload: { role: body.role }, ...context(req) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const arch = await requireOwnedArchitecture(params.id, session.user.id, 'owner');
  if (!arch) return NextResponse.json({ error: 'Owner role required' }, { status: 403 });
  const body = Delete.parse(await req.json());
  await removeMember(params.id, body.userId);
  void record({ action: 'member.remove', architectureId: params.id, userId: session.user.id, targetType: 'member', targetId: body.userId, ...context(req) });
  return NextResponse.json({ ok: true });
}
