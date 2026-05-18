import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AlertRulesPanel, type RuleRow } from '@/components/alerts/alert-rules-panel';
import { ArchitectureNotifications } from '@/components/alerts/architecture-notifications';
import { ChaosPanel, type ChaosRow } from '@/components/chaos/chaos-panel';

export const dynamic = 'force-dynamic';

export default async function AlertsPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const arch = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true, slackWebhookUrl: true, notificationsEmail: true },
  });
  if (!arch) notFound();

  const [services, rules, chaos] = await Promise.all([
    prisma.service.findMany({ where: { architectureId: params.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.alertRule.findMany({
      where: { architectureId: params.id },
      include: { service: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.chaosSchedule.findMany({
      where: { architectureId: params.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const chaosRows: ChaosRow[] = chaos.map((c) => ({
    id: c.id,
    targetServiceId: c.targetServiceId,
    schedule: c.schedule,
    action: c.action,
    durationSec: c.durationSec,
    enabled: c.enabled,
    lastRunAt: c.lastRunAt?.toISOString() ?? null,
  }));

  const rows: RuleRow[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    service: r.service,
    condition: r.condition,
    windowSec: r.windowSec,
    forDurationSec: r.forDurationSec,
    severity: r.severity,
    channels: r.channels,
    enabled: r.enabled,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Alert rules</h2>
        <p className="text-sm text-muted-foreground mt-1">When a rule's condition holds for its <code className="text-xs">forDuration</code> window, an incident opens. It auto-resolves when the condition has been clear for 2× the window.</p>
      </div>
      <AlertRulesPanel architectureId={params.id} services={services} initialRules={rows} />
      <ChaosPanel architectureId={params.id} services={services} initialSchedules={chaosRows} />
      <ArchitectureNotifications
        architectureId={params.id}
        initial={{ slackWebhookUrl: arch.slackWebhookUrl, notificationsEmail: arch.notificationsEmail }}
      />
    </div>
  );
}
