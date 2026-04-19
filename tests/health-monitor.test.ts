import { describe, it, expect } from 'vitest';
import { simulateHealth } from '@/lib/health-monitor';

describe('simulateHealth', () => {
  it('returns one of healthy/degraded/down with a reasonable response time', () => {
    const result = simulateHealth({ id: '1', name: 'Order Service', healthEndpoint: null });
    expect(['healthy', 'degraded', 'down']).toContain(result.status);
    if (result.responseTime !== null) {
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.responseTime).toBeLessThan(1000);
    }
    expect(result.details).toHaveProperty('simulated', true);
  });

  it('is deterministic within the same minute for the same name', () => {
    const a = simulateHealth({ id: '1', name: 'Payment Service', healthEndpoint: null });
    const b = simulateHealth({ id: '2', name: 'Payment Service', healthEndpoint: null });
    expect(a.status).toBe(b.status);
  });
});
