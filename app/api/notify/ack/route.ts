import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAckToken } from '@/lib/notify/tokens';
import { ackIncident } from '@/lib/incidents';

// Magic-link acknowledge from email.
//
// GET renders a confirmation page and changes nothing: corporate mail scanners
// (Outlook SafeLinks, Proofpoint, …) prefetch every link, and a state-changing
// GET would acknowledge incidents before a human ever saw them. The button on
// that page POSTs back here, which performs the ack. Works for recipients
// without a ServiceLens account (e.g. on-call engineers from the roster).

function appUrl(req: Request, path: string, query?: Record<string, string>) {
  const dest = new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin);
  if (query) for (const [k, v] of Object.entries(query)) dest.searchParams.set(k, v);
  return dest;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · ServiceLens</title>
<style>body{margin:0;background:#000;color:#fcfdff;font:15px/1.5 system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh}
main{max-width:440px;padding:32px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#0a0a0c}
h1{font-size:22px;font-weight:500;margin:0 0 8px}p{color:rgba(255,255,255,.7);margin:0 0 20px}
button,a.btn{display:inline-block;background:#fcfdff;color:#000;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-weight:500;cursor:pointer;text-decoration:none}
.muted{font-size:12px;color:rgba(255,255,255,.45);margin-top:16px}</style></head><body><main>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

async function load(token: string | null) {
  if (!token) return { error: 'This link is missing its token.' } as const;
  let payload;
  try {
    payload = verifyAckToken(token);
  } catch {
    return { error: 'This link is invalid or has expired (links are valid for 24 hours).' } as const;
  }
  const incident = await prisma.incident.findUnique({
    where: { id: payload.incidentId },
    select: { id: true, title: true, severity: true, status: true, architectureId: true, service: { select: { name: true } } },
  });
  if (!incident) return { error: 'This incident no longer exists.' } as const;
  return { payload, incident } as const;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const r = await load(token);
  if ('error' in r) return page('Link problem', `<h1>Can’t acknowledge</h1><p>${esc(r.error!)}</p>`, 400);
  const { incident } = r;
  const open = appUrl(req, `/architectures/${incident.architectureId}/incidents/${incident.id}`).toString();

  if (incident.status !== 'open') {
    return page('Already handled', `<h1>Already ${esc(incident.status)}</h1><p>${esc(incident.title)}</p><a class="btn" href="${esc(open)}">Open incident</a>`);
  }
  return page(
    'Acknowledge incident',
    `<h1>Acknowledge this incident?</h1>
<p><strong>${esc(incident.severity.toUpperCase())}</strong> · ${esc(incident.title)}${incident.service ? ` · ${esc(incident.service.name)}` : ''}</p>
<form method="post"><input type="hidden" name="token" value="${esc(token!)}"><button type="submit">Acknowledge</button></form>
<p class="muted">Acknowledging tells your team you're on it and stops escalation.</p>`
  );
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = (form?.get('token') as string | null) ?? new URL(req.url).searchParams.get('token');
  const r = await load(token);
  if ('error' in r) return page('Link problem', `<h1>Can’t acknowledge</h1><p>${esc(r.error!)}</p>`, 400);
  const { payload, incident } = r;

  if (incident.status === 'open') await ackIncident(incident.id, payload.userId, payload.userId ? null : payload.email);

  // Members land in the app; external on-call engineers get a confirmation page.
  if (payload.userId) {
    return NextResponse.redirect(appUrl(req, `/architectures/${incident.architectureId}/incidents/${incident.id}`, { acked: '1' }), { status: 303 });
  }
  return page('Acknowledged', `<h1>Acknowledged</h1><p>${esc(incident.title)}</p><p class="muted">Your team has been notified. You can close this tab.</p>`);
}
