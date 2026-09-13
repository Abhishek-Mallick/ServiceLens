import { NextResponse } from 'next/server';
import { tick } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// External cron entry point for serverless deployments (Vercel Cron, the
// bundled GitHub Actions workflow, or any pinger). Runs one scheduler tick:
// due probes → alert rules → incidents, demo chaos drills, job queue.
// Guarded by CRON_SECRET when set.
//
// In dev: `curl http://localhost:3000/api/cron/tick`.
export async function GET(req: Request) {
  const required = process.env.CRON_SECRET;
  if (required) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${required}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const result = await tick();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  return GET(req);
}
