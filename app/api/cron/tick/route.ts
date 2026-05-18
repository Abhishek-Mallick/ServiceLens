import { NextResponse } from 'next/server';
import { runDueSchedules } from '@/lib/chaos';
import { drain } from '@/lib/jobs';

// External cron entry point — Vercel Cron, GitHub Actions, or `curl` from a
// local launchd. Optional shared-secret guard via CRON_SECRET.
//
// In dev you can hit this directly: `curl http://localhost:3000/api/cron/tick`.
export async function GET(req: Request) {
  const required = process.env.CRON_SECRET;
  if (required) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${required}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const [chaos, jobs] = await Promise.all([runDueSchedules(), drain({ limit: 25 })]);
  return NextResponse.json({ chaos, jobsDrained: jobs.length });
}

export async function POST(req: Request) {
  return GET(req);
}
