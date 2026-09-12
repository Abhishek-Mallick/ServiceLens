import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiKeyAuth, v1Error } from '@/lib/api-keys';
import { findServiceByName } from '@/lib/v1';

export const dynamic = 'force-dynamic';

const Beat = z.object({
  status: z.enum(['healthy', 'degraded', 'down']).default('healthy'),
  message: z.string().max(500).optional(),
  intervalSec: z.number().int().min(15).max(3600).default(60),
});

// Push-mode health for services ServiceLens can't reach (private networks).
// The first beat creates a heartbeat probe; if beats stop for 2× intervalSec
// the service is marked down and the usual rules/incidents/paging apply.
export async function POST(req: Request, { params }: { params: { name: string } }) {
  const auth = await apiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const svc = await findServiceByName(auth.architectureId, decodeURIComponent(params.name));
  if (!svc) return v1Error(404, 'not_found', `No service named "${decodeURIComponent(params.name)}". Register it first with PUT /api/v1/services/{name}.`);
  const parsed = Beat.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return v1Error(400, 'invalid_input', 'Invalid body.', parsed.error.flatten().fieldErrors);

  await prisma.service.update({
    where: { id: svc.id },
    data: { heartbeatAt: new Date(), heartbeatStatus: parsed.data.status, heartbeatMessage: parsed.data.message ?? null },
  });
  const probe = await prisma.probe.findFirst({ where: { serviceId: svc.id, type: 'heartbeat' } });
  if (!probe) {
    await prisma.probe.create({
      data: { serviceId: svc.id, name: 'Heartbeat', type: 'heartbeat', target: 'push', intervalSec: parsed.data.intervalSec, timeoutSec: 1, enabled: true },
    });
  } else if (probe.intervalSec !== parsed.data.intervalSec) {
    await prisma.probe.update({ where: { id: probe.id }, data: { intervalSec: parsed.data.intervalSec } });
  }
  return NextResponse.json({ ok: true, markedDownAfterSec: parsed.data.intervalSec * 2 });
}
