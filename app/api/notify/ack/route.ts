import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAckToken } from '@/lib/notify/tokens';
import { ackIncident } from '@/lib/incidents';
import { colors as c, rounded } from '@/lib/design-tokens';

const pageTheme = {
  bg: c.card,
  ink: c.foreground,
  muted: c.mutedForeground,
  border: c.border,
  cardBg: c.card,
  primary: c.foreground,
  onPrimary: '#ffffff',
} as const;
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';

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
<style>body{margin:0;background:${pageTheme.bg};color:${pageTheme.ink};font:15px/1.5 system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh}
main{max-width:440px;padding:32px;border:1px solid ${pageTheme.border};border-radius:${rounded.lg};background:${pageTheme.cardBg}}
h1{font-size:22px;font-weight:500;margin:0 0 8px}p{color:${pageTheme.muted};margin:0 0 20px}
button,a.btn{display:inline-block;background:${pageTheme.primary};color:${pageTheme.onPrimary};border:0;border-radius:${rounded.md};padding:10px 16px;font:inherit;font-weight:500;cursor:pointer;text-decoration:none}
.muted{font-size:12px;color:${pageTheme.muted};margin-top:16px}</style></head><body><main>${body}</main></body></html>`;
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

// Tokens are HMAC-signed, so guessing is hopeless; this just caps how hard one
// client can hit the DB through the confirm page.
function limited(req: Request) {
  const r = rateLimit(`ack:${clientIp(req)}`, LIMITS.ackPerMin);
  return r.ok ? null : page('Slow down', `<h1>Too many requests</h1><p>Try again in ${r.retryAfterSec}s.</p>`, 429);
}

export async function GET(req: Request) {
  const blocked = limited(req);
  if (blocked) return blocked;
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
  const blocked = limited(req);
  if (blocked) return blocked;
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
