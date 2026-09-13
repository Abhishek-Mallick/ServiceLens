// Starts the in-process monitoring scheduler when the Next.js server boots, so
// probes, alert rules and incidents keep running with no browser open.
//
// Skipped on Vercel (serverless functions don't live between requests — drive
// /api/cron/tick from a cron there) and when SCHEDULER=off (e.g. when you run
// `npm run worker` as a separate process instead).
//
// The import must sit directly inside the NEXT_RUNTIME check so Next strips it
// from the edge-runtime build (the scheduler needs Node APIs).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.VERCEL || process.env.SCHEDULER === 'off') return;
    const { startSchedulerLoop } = await import('./lib/scheduler');
    const interval = Math.max(5, Number(process.env.SCHEDULER_INTERVAL ?? 15));
    startSchedulerLoop(interval);
    console.log(`[scheduler] in-process loop started — tick every ${interval}s`);
  }
}
