'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pause, Play, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = typeof LEVELS[number];

interface LogRow {
  id: string;
  service: { id: string; name: string } | null;
  serviceId?: string;
  serviceName?: string;
  level: string;
  message: string;
  at: string;
  traceId?: string | null;
}

export interface ServiceLite { id: string; name: string }

const LEVEL_COLOR: Record<string, string> = {
  debug: 'text-muted-foreground',
  info: 'text-sky-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
};

export function LogsViewer({ architectureId, services }: { architectureId: string; services: ServiceLite[] }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tail, setTail] = useState(false);
  const [q, setQ] = useState('');
  const [levels, setLevels] = useState<Set<Level>>(new Set(['info', 'warn', 'error']));
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [sinceMin, setSinceMin] = useState(60);
  const esRef = useRef<EventSource | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setBusy('fetch');
    const url = new URL(`/api/architectures/${architectureId}/logs`, window.location.origin);
    selectedServices.forEach((s) => url.searchParams.append('service', s));
    levels.forEach((l) => url.searchParams.append('level', l));
    if (q.trim()) url.searchParams.set('q', q.trim());
    url.searchParams.set('sinceMin', String(sinceMin));
    url.searchParams.set('limit', '500');
    const r = await fetch(url.toString());
    setBusy(null);
    if (!r.ok) { toast.error('Search failed'); return; }
    const j = await r.json();
    setLogs(j.logs);
  }, [architectureId, levels, q, selectedServices, sinceMin]);

  useEffect(() => { fetchLogs(); /* initial */ }, [fetchLogs]);

  // Tail via SSE
  useEffect(() => {
    if (!tail) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }
    const url = new URL(`/api/architectures/${architectureId}/logs/tail`, window.location.origin);
    selectedServices.forEach((s) => url.searchParams.append('service', s));
    const es = new EventSource(url.toString());
    esRef.current = es;
    es.addEventListener('logs', (ev) => {
      try {
        const incoming: LogRow[] = JSON.parse((ev as MessageEvent).data);
        const adapted = incoming.map((r) => ({
          ...r,
          service: r.service ?? (r.serviceName ? { id: r.serviceId ?? '', name: r.serviceName } : null),
        }));
        setLogs((prev) => [...adapted.reverse(), ...prev].slice(0, 1000));
      } catch { /* ignore */ }
    });
    es.addEventListener('error', () => {
      // Auto-close on error so the icon flips back; user can retoggle.
      es.close();
      esRef.current = null;
      setTail(false);
    });
    return () => { es.close(); esRef.current = null; };
  }, [tail, architectureId, selectedServices]);

  async function generate() {
    setBusy('gen');
    const r = await fetch(`/api/architectures/${architectureId}/logs/generate`, { method: 'POST' });
    setBusy(null);
    if (!r.ok) { toast.error('Generate failed'); return; }
    toast.success('Generated synthetic logs');
    fetchLogs();
  }

  function toggleLevel(l: Level) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l); else next.add(l);
      return next;
    });
  }
  function toggleService(id: string) {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const passes = (r: LogRow) => levels.has(r.level as Level);
  const visible = logs.filter(passes);

  return (
    <Card>
      <CardHeader className="space-y-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Logs</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={generate} disabled={busy === 'gen'}>
              {busy === 'gen' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generate sample
            </Button>
            <Button size="sm" variant="outline" onClick={fetchLogs} disabled={busy === 'fetch'}>
              <RefreshCw className={cn('h-3.5 w-3.5', busy === 'fetch' && 'animate-spin')} />
              Refresh
            </Button>
            <Button size="sm" variant={tail ? 'default' : 'outline'} onClick={() => setTail((t) => !t)}>
              {tail ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {tail ? 'Pause tail' : 'Live tail'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchLogs(); }}
            placeholder="grep…" className="h-8 max-w-xs" />
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground mr-1">since</span>
            <select value={sinceMin} onChange={(e) => setSinceMin(Number(e.target.value))}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs">
              <option value={5}>5m</option>
              <option value={15}>15m</option>
              <option value={60}>1h</option>
              <option value={360}>6h</option>
              <option value={1440}>24h</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            {LEVELS.map((l) => (
              <button key={l} onClick={() => toggleLevel(l)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide',
                  levels.has(l) ? 'border-foreground/40 text-foreground' : 'border-border/60 text-muted-foreground line-through'
                )}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {services.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">services:</span>
            {services.map((s) => (
              <button key={s.id} onClick={() => toggleService(s.id)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px]',
                  selectedServices.size === 0 || selectedServices.has(s.id)
                    ? 'border-foreground/40 text-foreground'
                    : 'border-border/60 text-muted-foreground'
                )}>
                {s.name}
              </button>
            ))}
            {selectedServices.size > 0 && (
              <button onClick={() => setSelectedServices(new Set())} className="text-[11px] text-muted-foreground underline ml-1">
                clear
              </button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div ref={listRef} className="rounded-md border border-border/60 bg-black/40 font-mono text-[12px] leading-relaxed max-h-[70vh] overflow-y-auto">
          {visible.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No logs matched. Click <em>Generate sample</em> to seed some, or POST to <code className="text-[10px]">/api/services/:id/logs</code> with the service bearer token.
            </div>
          )}
          {visible.map((r) => (
            <div key={r.id} className="grid grid-cols-[80px_60px_140px_1fr] gap-2 px-3 py-1 border-b border-border/30 hover:bg-white/[0.02]">
              <span className="text-muted-foreground tabular-nums">{new Date(r.at).toLocaleTimeString()}</span>
              <span className={cn('uppercase tracking-wide', LEVEL_COLOR[r.level] ?? '')}>{r.level}</span>
              <span className="text-muted-foreground truncate">{r.service?.name ?? r.serviceName ?? '—'}</span>
              <span className="break-words">{r.message}</span>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground mt-2">{visible.length} entries · {tail ? 'tailing live' : 'static query'}</div>
      </CardContent>
    </Card>
  );
}
