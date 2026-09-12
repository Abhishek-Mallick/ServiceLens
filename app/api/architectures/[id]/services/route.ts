import { NextResponse } from 'next/server';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { createService, OnboardingError, ServiceInput } from '@/lib/onboarding';
import { record, context } from '@/lib/audit';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const architecture = await requireOwnedArchitecture(params.id, session.user.id, 'editor');
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = ServiceInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const service = await createService(params.id, parsed.data);
    void record({
      action: 'service.add',
      architectureId: params.id,
      userId: session.user.id,
      targetType: 'service',
      targetId: service.id,
      payload: { name: service.name, repoUrl: service.repoUrl, deployedUrl: service.deployedUrl },
      ...context(req),
    });
    return NextResponse.json({ service }, { status: 201 });
  } catch (err) {
    if (err instanceof OnboardingError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
