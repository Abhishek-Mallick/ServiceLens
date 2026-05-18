// Append-only audit trail. Records actor + action + target + small payload.
// Every write is fire-and-forget — never block the caller on audit failure.

import { prisma } from './prisma';
import { stringify } from './utils';

export type AuditAction =
  // architecture lifecycle
  | 'architecture.create' | 'architecture.update' | 'architecture.delete'
  | 'architecture.settings.update'
  // membership
  | 'member.invite' | 'member.remove' | 'member.role_change'
  // services
  | 'service.add' | 'service.delete' | 'service.analyze'
  // probes
  | 'probe.create' | 'probe.update' | 'probe.delete' | 'probe.run_now'
  // alert rules
  | 'rule.create' | 'rule.update' | 'rule.delete'
  // incidents
  | 'incident.open' | 'incident.ack' | 'incident.assign' | 'incident.comment' | 'incident.resolve'
  | 'incident.rca' | 'incident.fix_pr'
  // chaos
  | 'chaos.now' | 'chaos.schedule.create' | 'chaos.schedule.update' | 'chaos.schedule.delete'
  // logs
  | 'logs.ingest' | 'logs.token.rotate';

export interface AuditInput {
  action: AuditAction;
  architectureId?: string | null;
  userId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function record(input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        architectureId: input.architectureId ?? null,
        userId: input.userId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        payload: input.payload ? stringify(input.payload) : null,
      },
    });
  } catch (err) {
    console.error('[audit] write failed:', err);
  }
}

// Convenience for route handlers — pulls ip + ua from the Request.
export function context(req: Request): Pick<AuditInput, 'ip' | 'userAgent'> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = req.headers.get('user-agent') ?? null;
  return { ip, userAgent };
}

export async function listForArchitecture(architectureId: string, limit = 100) {
  return prisma.auditEvent.findMany({
    where: { architectureId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { at: 'desc' },
    take: Math.min(limit, 500),
  });
}
