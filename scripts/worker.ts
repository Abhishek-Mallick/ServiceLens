// Standalone worker tick — drains the Job queue and runs due chaos schedules.
// Use this when self-hosting outside Vercel (so /api/cron/tick has nothing
// poking it). On Vercel, the equivalent is a Vercel Cron entry pointing at
// /api/cron/tick.
//
//   npm run worker          # tick every 30s
//   WORKER_INTERVAL=5 npm run worker   # tick every 5s

import { drain } from '../lib/jobs';
import { runDueSchedules } from '../lib/chaos';

const INTERVAL_SEC = Math.max(5, Number(process.env.WORKER_INTERVAL ?? 30));

async function tick() {
  const start = Date.now();
  try {
    const [jobs, chaos] = await Promise.all([drain({ limit: 25 }), runDueSchedules()]);
    const ranChaos = chaos.filter((c) => c.ok).length;
    const failedChaos = chaos.filter((c) => !c.ok);
    if (jobs.length || ranChaos || failedChaos.length) {
      console.log(`[worker ${new Date().toISOString()}] jobs=${jobs.length} chaos_ok=${ranChaos} chaos_failed=${failedChaos.length} in ${Date.now() - start}ms`);
      for (const f of failedChaos) console.warn(`  · chaos ${f.scheduleId}: ${f.error}`);
    }
  } catch (err) {
    console.error('[worker] tick failed:', err);
  }
}

console.log(`[worker] starting — tick every ${INTERVAL_SEC}s`);
void tick();
const handle = setInterval(tick, INTERVAL_SEC * 1000);

function shutdown(sig: string) {
  console.log(`[worker] ${sig} — stopping`);
  clearInterval(handle);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
