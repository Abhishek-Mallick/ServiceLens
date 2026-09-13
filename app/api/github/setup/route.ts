import { NextResponse } from 'next/server';
import { requireSession, requireOwnedArchitecture } from '@/lib/auth-helpers';
import { clearCoverageCache } from '@/lib/github/app';

export const dynamic = 'force-dynamic';

// GitHub App "Setup URL": GitHub sends people here after they install or
// change the App's repository access. `state` is the architecture they came from.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const action = url.searchParams.get('setup_action') ?? 'install';
  const state = url.searchParams.get('state');
  clearCoverageCache();

  const session = await requireSession();
  if (!session) return NextResponse.redirect(new URL('/login', base));
  if (state && /^[A-Za-z0-9_-]{8,64}$/.test(state)) {
    const arch = await requireOwnedArchitecture(state, session.user.id);
    if (arch) return NextResponse.redirect(new URL(`/architectures/${arch.id}/services?github=${encodeURIComponent(action)}`, base));
  }
  return NextResponse.redirect(new URL(`/dashboard?github=${encodeURIComponent(action)}`, base));
}
