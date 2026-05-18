// Chaos drills — controlled fault injection on a target service.
//
// v1 supports a deliberately small action set:
//   - kill_service:  flips the service to `down` and opens a critical incident
//                    so the entire alert → notify → RCA → fix-PR pipeline fires.
//   - degrade:       flips status to `degraded` with high latency for durationSec.
//   - latency_spike: leaves status healthy but writes high-RT health rows.
//
// Schedules use a simple grammar (no cron parser dependency):
//   "every 5m" | "every 1h" | "HH:MM" (UTC daily)
//
// `runDueSchedules()` is intended to be called by /api/cron/tick from an
// external scheduler (Vercel Cron in prod) or, in dev, the next probe poll.

import { prisma } from './prisma';
import { stringify } from './utils';
import { publish } from './realtime';
import { openIncident } from './incidents';

export type ChaosAction = 'kill_service' | 'degrade' | 'latency_spike';

export interface ApplyChaosOptions {
  architectureId: string;
  serviceId: string;
  action: ChaosAction;
  durationSec: number;
  byUserId?: string | null;
  scheduleId?: string | null;
}

export async function applyChaos(opts: ApplyChaosOptions) {
  const svc = await prisma.service.findFirst({
    where: { id: opts.serviceId, architectureId: opts.architectureId },
    select: { id: true, name: true },
  });
  if (!svc) throw new Error('service not in architecture');

  if (opts.action === 'kill_service') {
    await prisma.service.update({
      where: { id: svc.id },
      data: { healthStatus: 'down', lastHealthCheck: new Date(), simulated: true },
    });
    await prisma.healthRecord.create({
      data: { serviceId: svc.id, status: 'down', responseTime: null, simulated: true, details: stringify({ chaos: 'kill_service' }) },
    });
    publish(opts.architectureId, 'chaos', { action: opts.action, serviceId: svc.id, name: svc.name, durationSec: opts.durationSec });
    publish(opts.architectureId, 'health', { serviceId: svc.id, name: svc.name, status: 'down', rt: null, simulated: true });
    const { id } = await openIncident({
      architectureId: opts.architectureId,
      serviceId: svc.id,
      title: `Chaos drill — ${svc.name} forced down`,
      severity: 'critical',
      source: 'synthetic',
      summary: `Scheduled chaos drill (${opts.durationSec}s). Validates the alert → notify → RCA → fix-PR pipeline.`,
      simulated: true,
      byUserId: opts.byUserId ?? null,
    });
    return { incidentId: id, ranAt: new Date() };
  }

  if (opts.action === 'degrade') {
    const rt = 1200 + Math.floor(Math.random() * 800);
    await prisma.service.update({
      where: { id: svc.id },
      data: { healthStatus: 'degraded', lastHealthCheck: new Date(), simulated: true },
    });
    await prisma.healthRecord.create({
      data: { serviceId: svc.id, status: 'degraded', responseTime: rt, simulated: true, details: stringify({ chaos: 'degrade' }) },
    });
    publish(opts.architectureId, 'chaos', { action: opts.action, serviceId: svc.id, name: svc.name });
    publish(opts.architectureId, 'health', { serviceId: svc.id, name: svc.name, status: 'degraded', rt, simulated: true });
    return { ranAt: new Date() };
  }

  if (opts.action === 'latency_spike') {
    const rt = 2500 + Math.floor(Math.random() * 1500);
    await prisma.healthRecord.create({
      data: { serviceId: svc.id, status: 'healthy', responseTime: rt, simulated: true, details: stringify({ chaos: 'latency_spike' }) },
    });
    await prisma.service.update({
      where: { id: svc.id },
      data: { lastHealthCheck: new Date(), simulated: true },
    });
    publish(opts.architectureId, 'chaos', { action: opts.action, serviceId: svc.id, name: svc.name, rt });
    publish(opts.architectureId, 'health', { serviceId: svc.id, name: svc.name, status: 'healthy', rt, simulated: true });
    return { ranAt: new Date() };
  }

  throw new Error(`unsupported chaos action: ${opts.action}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule parsing — minimal grammar, validated up front so we never branch
// inside the hot drain loop.
// ─────────────────────────────────────────────────────────────────────────────
export interface ParsedSchedule {
  kind: 'interval' | 'daily';
  intervalSec?: number;
  hour?: number;
  minute?: number;
}

const EVERY_RE = /^every\s+(\d+)\s*(s|m|h)$/i;
const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

export function parseSchedule(raw: string): ParsedSchedule | null {
  const m = raw.trim().match(EVERY_RE);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mult = unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
    if (n <= 0) return null;
    return { kind: 'interval', intervalSec: n * mult };
  }
  const h = raw.trim().match(HHMM_RE);
  if (h) {
    const hour = Number(h[1]);
    const minute = Number(h[2]);
    if (hour > 23 || minute > 59) return null;
    return { kind: 'daily', hour, minute };
  }
  return null;
}

// Returns true if a schedule's next-fire is on or before `now` given its lastRunAt.
export function isDue(parsed: ParsedSchedule, lastRunAt: Date | null, now = new Date()): boolean {
  if (parsed.kind === 'interval' && parsed.intervalSec) {
    if (!lastRunAt) return true;
    return now.getTime() - lastRunAt.getTime() >= parsed.intervalSec * 1000;
  }
  if (parsed.kind === 'daily' && parsed.hour != null && parsed.minute != null) {
    // Fires once per UTC day at HH:MM.
    const todayFire = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), parsed.hour, parsed.minute, 0));
    if (now < todayFire) return false;
    if (!lastRunAt) return true;
    return lastRunAt < todayFire;
  }
  return false;
}

export async function runDueSchedules(now = new Date()): Promise<Array<{ scheduleId: string; ok: boolean; error?: string }>> {
  const schedules = await prisma.chaosSchedule.findMany({
    where: { enabled: true },
    include: { architecture: { select: { id: true } } },
  });
  const results: Array<{ scheduleId: string; ok: boolean; error?: string }> = [];
  for (const s of schedules) {
    const parsed = parseSchedule(s.schedule);
    if (!parsed) { results.push({ scheduleId: s.id, ok: false, error: 'invalid schedule' }); continue; }
    if (!isDue(parsed, s.lastRunAt, now)) continue;
    try {
      await applyChaos({
        architectureId: s.architectureId,
        serviceId: s.targetServiceId,
        action: s.action as ChaosAction,
        durationSec: s.durationSec,
        scheduleId: s.id,
      });
      await prisma.chaosSchedule.update({ where: { id: s.id }, data: { lastRunAt: now } });
      results.push({ scheduleId: s.id, ok: true });
    } catch (err) {
      results.push({ scheduleId: s.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
