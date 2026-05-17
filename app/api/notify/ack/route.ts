import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAckToken } from '@/lib/notify/tokens';
import { ackIncident } from '@/lib/incidents';

// GET /api/notify/ack?token=… — acknowledges an incident via magic-link from email/slack.
// Always redirects to the incident page so users land somewhere useful, even if the token
// is expired or already used.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const baseRedirect = (path: string, query?: Record<string, string>) => {
    const dest = new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? url.origin);
    if (query) for (const [k, v] of Object.entries(query)) dest.searchParams.set(k, v);
    return NextResponse.redirect(dest, { status: 302 });
  };

  if (!token) return baseRedirect('/dashboard', { ack_error: 'missing-token' });

  let payload;
  try {
    payload = verifyAckToken(token);
  } catch (err) {
    return baseRedirect('/dashboard', { ack_error: 'invalid-token' });
  }

  const incident = await prisma.incident.findUnique({
    where: { id: payload.incidentId },
    select: { id: true, architectureId: true, status: true },
  });
  if (!incident) return baseRedirect('/dashboard', { ack_error: 'not-found' });

  // Idempotent: if already ack'd or resolved, skip the write but still redirect.
  if (incident.status === 'open') {
    await ackIncident(incident.id, payload.userId);
  }
  return baseRedirect(`/architectures/${incident.architectureId}/incidents/${incident.id}`, { acked: '1' });
}
