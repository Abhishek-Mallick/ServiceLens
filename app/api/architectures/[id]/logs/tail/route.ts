import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// SSE — polls Prisma every 2s for new rows since the last cursor and emits them.
// Cheap, no external broker needed. Stops when the client disconnects.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  const owned = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!owned) return new Response('Not found', { status: 404 });

  const url = new URL(req.url);
  const serviceFilter = url.searchParams.getAll('service').filter(Boolean);

  const encoder = new TextEncoder();
  let cursor: Date = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`));
      }
      send('hello', { ts: Date.now() });

      const interval = setInterval(async () => {
        try {
          const rows = await prisma.logEntry.findMany({
            where: {
              service: { architectureId: params.id },
              ...(serviceFilter.length ? { serviceId: { in: serviceFilter } } : {}),
              at: { gt: cursor },
            },
            orderBy: { at: 'asc' },
            take: 200,
            include: { service: { select: { id: true, name: true } } },
          });
          if (rows.length > 0) {
            cursor = rows[rows.length - 1].at;
            send('logs', rows.map((r) => ({
              id: r.id,
              service: r.service.name,
              serviceId: r.service.id,
              level: r.level,
              message: r.message,
              at: r.at.toISOString(),
              traceId: r.traceId,
            })));
          } else {
            send('ping', { ts: Date.now() });
          }
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : 'tail error' });
        }
      }, 2000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
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
