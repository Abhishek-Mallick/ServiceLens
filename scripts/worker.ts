// Standalone monitoring worker — runs the same scheduler tick as the in-process
// loop (probes → rules → incidents, chaos drills on demo archs, job queue).
// Use it when the web tier can't hold a loop (serverless) or you want monitoring
// isolated from the web server; set SCHEDULER=off on the web tier in that case.
//
//   npm run worker                       # tick every 15s
//   SCHEDULER_INTERVAL=5 npm run worker  # tick every 5s

import { tick } from '../lib/scheduler';

const INTERVAL_SEC = Math.max(5, Number(process.env.SCHEDULER_INTERVAL ?? process.env.WORKER_INTERVAL ?? 15));

let running = false;
async function run() {
  if (running) return;
  running = true;
  try {
    const r = await tick();
    if (r.probed || r.chaos || r.jobs) {
      console.log(`[worker ${new Date().toISOString()}] probed=${r.probed} simulated=${r.simulated} chaos=${r.chaos} jobs=${r.jobs} in ${r.ms}ms`);
    }
  } catch (err) {
    console.error('[worker] tick failed:', err);
  } finally {
    running = false;
  }
}

console.log(`[worker] starting — tick every ${INTERVAL_SEC}s`);
void run();
const handle = setInterval(run, INTERVAL_SEC * 1000);

function shutdown(sig: string) {
  console.log(`[worker] ${sig} — stopping`);
  clearInterval(handle);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
