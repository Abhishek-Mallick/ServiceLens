// What happens after an incident opens, as durable jobs:
//
//   incident_opened → assign on-call from the roster
//                   → notify (members + on-call)
//                   → schedule `escalate` if the on-call has an escalation contact
//                   → enqueue `rca` (real architectures only)
//   escalate        → still unacknowledged? page the escalation contact
//   rca             → generate + persist the root-cause analysis
//   notify          → ack / resolve notifications
//
// Every step is idempotent so retries and duplicate drains are safe.

import { prisma } from './prisma';
import { stringify } from './utils';
import { kick, enqueue } from './jobs';
import { currentRoster, findOncall } from './oncall/roster';
import { notifyForIncident, type IncidentTemplate } from './incidents';
import { streamRcaInto } from './rca';

const RCA_IN_FLIGHT_MS = 3 * 60_000;

export async function assignOncall(incidentId: string) {
  const inc = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { service: { select: { name: true } }, oncall: true, architecture: { select: { id: true, members: { include: { user: { select: { id: true, email: true } } } } } } },
  });
  if (!inc) return null;
  if (inc.oncall) return inc.oncall;

  const roster = await currentRoster(inc.architectureId);
  const entry = findOncall(roster, inc.service?.name);
  if (!entry) return null;

  const assignment = await prisma.incidentOncallAssignment.upsert({
    where: { incidentId },
    create: { incidentId, name: entry.name, email: entry.email, escalationEmail: entry.escalationEmail, source: 'google_sheet_csv' },
    update: {},
  });
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'oncall_assigned', payload: stringify({ name: entry.name, email: entry.email, matchedRow: entry.service }) },
  });

  // If the on-call engineer is also a member, make them the assignee.
  const member = inc.architecture.members.find((m) => m.user.email?.toLowerCase() === entry.email.toLowerCase());
  if (member && !inc.assigneeId) {
    await prisma.incident.update({ where: { id: incidentId }, data: { assigneeId: member.user.id } });
  }
  return assignment;
}

export async function handleIncidentOpened(incidentId: string) {
  const inc = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { id: true, rcaMarkdown: true, architecture: { select: { demo: true, oncallSource: { select: { escalateAfterMin: true } } } } },
  });
  if (!inc) return { skipped: 'incident not found' };
  const demo = inc.architecture.demo;

  const assignment = demo ? null : await assignOncall(incidentId);

  // Notify once per incident even if this job is retried.
  const alreadyNotified = await prisma.incidentEvent.findFirst({
    where: { incidentId, type: 'notification_sent', payload: { contains: '"template":"IncidentOpened"' } },
    select: { id: true },
  });
  if (!alreadyNotified) await notifyForIncident(incidentId, 'IncidentOpened');

  const escalateAfter = inc.architecture.oncallSource?.escalateAfterMin ?? 0;
  if (assignment?.escalationEmail && escalateAfter > 0 && !assignment.escalatedAt) {
    await enqueue('escalate', { incidentId }, { scheduledAt: new Date(Date.now() + escalateAfter * 60_000) });
  }

  // Auto-RCA for real architectures. The demo's simulator opens incidents
  // constantly; its RCA stays on-demand so it doesn't burn LLM quota.
  if (!demo && !inc.rcaMarkdown) await kick('rca', { incidentId });

  return { oncall: assignment?.email ?? null, escalateAfter: assignment?.escalationEmail ? escalateAfter : 0 };
}

export async function handleEscalate(incidentId: string) {
  const inc = await prisma.incident.findUnique({ where: { id: incidentId }, include: { oncall: true } });
  if (!inc?.oncall?.escalationEmail) return { skipped: 'no escalation contact' };
  if (inc.status !== 'open') return { skipped: `incident is ${inc.status}` };
  if (inc.oncall.escalatedAt) return { skipped: 'already escalated' };

  await prisma.incidentOncallAssignment.update({ where: { incidentId }, data: { escalatedAt: new Date() } });
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'escalated', payload: stringify({ to: inc.oncall.escalationEmail }) },
  });
  await notifyForIncident(incidentId, 'IncidentEscalated');
  return { escalatedTo: inc.oncall.escalationEmail };
}

export async function handleRca(incidentId: string) {
  const inc = await prisma.incident.findUnique({ where: { id: incidentId }, select: { rcaMarkdown: true } });
  if (!inc) return { skipped: 'incident not found' };
  if (inc.rcaMarkdown) return { skipped: 'already generated' };

  // Don't race a stream a user started from the incident page.
  const lastStart = await prisma.incidentEvent.findFirst({ where: { incidentId, type: 'rca_started' }, orderBy: { at: 'desc' } });
  if (lastStart && Date.now() - lastStart.at.getTime() < RCA_IN_FLIGHT_MS) {
    const done = await prisma.incidentEvent.findFirst({ where: { incidentId, type: 'rca_completed', at: { gte: lastStart.at } } });
    if (!done) return { skipped: 'rca already in progress' };
  }
  const text = await streamRcaInto(incidentId);

  // Auto mode: open a draft fix PR once the RCA exists (real architectures only).
  const arch = await prisma.incident.findUnique({ where: { id: incidentId }, select: { architecture: { select: { autoFixPr: true, demo: true } } } });
  if (arch?.architecture.autoFixPr && !arch.architecture.demo) await kick('fix_pr', { incidentId });
  return { chars: text.length };
}

export async function handleNotify(incidentId: string, template: IncidentTemplate) {
  await notifyForIncident(incidentId, template);
  return { template };
}
