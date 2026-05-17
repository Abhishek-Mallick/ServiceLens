import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ingestForService, findServiceByIngestToken, type IngestEntry } from '@/lib/logs';

const Entry = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  message: z.string().min(1).max(4000),
  fields: z.record(z.unknown()).nullable().optional(),
  traceId: z.string().nullable().optional(),
  spanId: z.string().nullable().optional(),
  at: z.union([z.string(), z.number()]).optional(),
});

// HEC-style: accept either { entries: [...] } or a single entry, or NDJSON.
async function parseBody(req: Request): Promise<IngestEntry[]> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/x-ndjson') || ct.includes('text/plain')) {
    const text = await req.text();
    return text.split('\n').filter(Boolean).map((line) => Entry.parse(JSON.parse(line)) as IngestEntry);
  }
  const body = await req.json();
  if (Array.isArray(body?.entries)) {
    return body.entries.map((e: unknown) => Entry.parse(e) as IngestEntry);
  }
  if (Array.isArray(body)) {
    return body.map((e: unknown) => Entry.parse(e) as IngestEntry);
  }
  return [Entry.parse(body) as IngestEntry];
}

export async function POST(req: Request, { params }: { params: { serviceId: string } }) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'Bearer token required' }, { status: 401 });

  const svc = await findServiceByIngestToken(token);
  if (!svc || svc.id !== params.serviceId) {
    return NextResponse.json({ error: 'Invalid token for service' }, { status: 403 });
  }
  let entries: IngestEntry[];
  try {
    entries = await parseBody(req);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Bad request' }, { status: 400 });
  }
  const res = await ingestForService(svc.id, entries, { simulated: false });
  return NextResponse.json(res, { status: 202 });
}
