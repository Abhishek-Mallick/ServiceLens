import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { streamRcaInto } from '@/lib/rca';
import { requireOwnedIncident } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// SSE: streams `delta` events (token chunks), an optional `error` event,
// then a `done` event with the final assembled markdown. Hits OpenRouter
// when WORKERS_AI_CREDENTIALS is set; otherwise the heuristic fallback streams a
// shorter analysis so the UX works without any keys.
export async function POST(_req: Request, { params }: { params: { incidentId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  // Generating RCA writes to the incident: editors and owners only.
  const owned = await requireOwnedIncident(params.incidentId, session.user.id, 'editor');
  if (!owned) return new Response('Not found', { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('start', { ts: Date.now() });
      try {
        const final = await streamRcaInto(params.incidentId, {
          onDelta: (chunk) => send('delta', chunk),
          onError: (err) => send('error', { message: err.message }),
        });
        send('done', { chars: final.length });
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : String(err) });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
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
