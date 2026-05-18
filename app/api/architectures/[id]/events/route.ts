import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { subscribe } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

// Multiplexed SSE stream — one event per realtime publish. Clients filter by
// `kind`. Survives idle via a 15s `ping` keep-alive so reverse proxies don't
// cut the connection.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  const owned = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return new Response('Not found', { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { /* connection closed */ }
      };
      send('hello', { ts: Date.now(), architectureId: params.id });

      const unsubscribe = subscribe(params.id, (ev) => {
        send(ev.kind, { at: ev.at, ...ev.payload });
      });
      const ka = setInterval(() => send('ping', { ts: Date.now() }), 15_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(ka);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
