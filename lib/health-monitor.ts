import { prisma } from './prisma';
import { stringify } from './utils';
import { publish } from './realtime';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number | null;
  details: Record<string, unknown> | null;
  simulated: boolean;
}

interface ServiceLike {
  id: string;
  name: string;
  healthEndpoint: string | null;
}

export function simulateHealth(service: ServiceLike): HealthCheckResult {
  // Seed by name so each service has a stable baseline but some variance
  const nameSeed = Array.from(service.name).reduce((a, c) => a + c.charCodeAt(0), 0);
  const nowMinute = Math.floor(Date.now() / 60_000);
  const rand = Math.abs(Math.sin(nameSeed * 0.31 + nowMinute * 0.07));
  const baseline = 60 + (nameSeed % 100);
  const responseTime = Math.floor(baseline + rand * 180);

  let status: 'healthy' | 'degraded' | 'down' = 'healthy';
  if (rand > 0.97) status = 'down';
  else if (rand > 0.88) status = 'degraded';

  // Occasionally force Payment Service to degrade and Search Service to go down for demo flavor
  if (/payment/i.test(service.name) && rand > 0.75) status = 'degraded';
  if (/search/i.test(service.name) && rand > 0.92) status = 'down';

  return {
    status,
    responseTime,
    details: { simulated: true, baseline },
    simulated: true,
  };
}

export async function recordHealth(serviceId: string, result: HealthCheckResult) {
  await prisma.healthRecord.create({
    data: {
      serviceId,
      status: result.status,
      responseTime: result.responseTime,
      details: result.details ? stringify(result.details) : null,
      simulated: result.simulated,
    },
  });
  const svc = await prisma.service.update({
    where: { id: serviceId },
    data: {
      healthStatus: result.status,
      lastHealthCheck: new Date(),
      simulated: result.simulated,
    },
    select: { id: true, architectureId: true, name: true, healthStatus: true },
  });
  publish(svc.architectureId, 'health', {
    serviceId: svc.id,
    name: svc.name,
    status: svc.healthStatus,
    rt: result.responseTime,
    simulated: result.simulated,
  });
}
