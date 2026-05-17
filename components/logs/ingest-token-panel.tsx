'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Loader2, RefreshCw, Eye, EyeOff } from 'lucide-react';

export function IngestTokenPanel({ serviceId }: { serviceId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/services/${serviceId}/ingest-token`).then((r) => r.json()).then((j) => setToken(j.token));
  }, [serviceId]);

  async function rotate() {
    setBusy('rotate');
    const r = await fetch(`/api/services/${serviceId}/ingest-token`, { method: 'POST' });
    setBusy(null);
    if (!r.ok) { toast.error('Rotate failed'); return; }
    const j = await r.json();
    setToken(j.token);
    setReveal(true);
    toast.success('Token rotated — previous token invalidated');
  }

  function copy() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    toast.success('Copied');
  }

  const masked = token ? token.slice(0, 6) + '…' + token.slice(-4) : '—';
  const display = reveal && token ? token : masked;
  const example = `curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/services/${serviceId}/logs \\\n  -H "Authorization: Bearer ${reveal && token ? token : '<TOKEN>'}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"level":"info","message":"hello from prod","traceId":"abc"}'`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Logs ingestion</CardTitle>
        <CardDescription>HEC-style endpoint — POST JSON, NDJSON, or batched entries with this bearer token.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-xs font-mono break-all">{display}</code>
          <Button size="icon" variant="ghost" onClick={() => setReveal((r) => !r)} title={reveal ? 'Hide' : 'Reveal'}>
            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={copy} title="Copy">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={rotate} disabled={busy === 'rotate'} title="Rotate">
            {busy === 'rotate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <pre className="rounded-md border border-border/60 bg-black/40 p-3 text-[11px] font-mono overflow-x-auto whitespace-pre">{example}</pre>
      </CardContent>
    </Card>
  );
}
