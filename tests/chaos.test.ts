import { describe, expect, it } from 'vitest';
import { parseSchedule, isDue } from '../lib/chaos';

describe('chaos/parseSchedule', () => {
  it('parses every-interval forms in s/m/h', () => {
    expect(parseSchedule('every 30s')).toEqual({ kind: 'interval', intervalSec: 30 });
    expect(parseSchedule('every 5m')).toEqual({ kind: 'interval', intervalSec: 300 });
    expect(parseSchedule('every 2h')).toEqual({ kind: 'interval', intervalSec: 7200 });
  });

  it('parses HH:MM daily form', () => {
    expect(parseSchedule('14:00')).toEqual({ kind: 'daily', hour: 14, minute: 0 });
    expect(parseSchedule('09:30')).toEqual({ kind: 'daily', hour: 9, minute: 30 });
  });

  it('rejects invalid forms', () => {
    expect(parseSchedule('every 0m')).toBeNull();
    expect(parseSchedule('25:00')).toBeNull();
    expect(parseSchedule('14:60')).toBeNull();
    expect(parseSchedule('whenever')).toBeNull();
    expect(parseSchedule('')).toBeNull();
  });
});

describe('chaos/isDue', () => {
  it('interval: fires immediately when lastRunAt is null', () => {
    const p = parseSchedule('every 5m')!;
    expect(isDue(p, null)).toBe(true);
  });

  it('interval: respects the interval window', () => {
    const p = parseSchedule('every 5m')!;
    const now = new Date('2026-05-18T12:10:00Z');
    expect(isDue(p, new Date('2026-05-18T12:06:00Z'), now)).toBe(false); // 4 min ago
    expect(isDue(p, new Date('2026-05-18T12:04:00Z'), now)).toBe(true);  // 6 min ago
  });

  it('daily: only fires once per UTC day after the time has passed', () => {
    const p = parseSchedule('14:00')!;
    const beforeFire = new Date('2026-05-18T13:59:00Z');
    const afterFire  = new Date('2026-05-18T14:01:00Z');
    expect(isDue(p, null, beforeFire)).toBe(false);
    expect(isDue(p, null, afterFire)).toBe(true);
    // Already ran today
    const yesterdayFire = new Date('2026-05-18T14:00:30Z');
    expect(isDue(p, yesterdayFire, new Date('2026-05-18T14:05:00Z'))).toBe(false);
    // Yesterday's run, today's fire window
    expect(isDue(p, new Date('2026-05-17T14:00:30Z'), afterFire)).toBe(true);
  });
});
