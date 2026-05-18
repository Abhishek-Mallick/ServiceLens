'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Loader2, RefreshCw, Sparkles } from 'lucide-react';

export function RcaPanel({
  incidentId,
  initial,
  model,
}: {
  incidentId: string;
  initial: string | null;
  model: string | null;
}) {
  const [text, setText] = useState(initial ?? '');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accumRef = useRef('');

  async function generate() {
    setStreaming(true);
    setError(null);
    setText('');
    accumRef.current = '';

    // Browsers don't allow POST via EventSource — use fetch + ReadableStream parsing.
    try {
      const res = await fetch(`/api/incidents/${incidentId}/rca`, { method: 'POST' });
      if (!res.ok || !res.body) {
        throw new Error(`status ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let event = 'message';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (event === 'delta') {
            try {
              const chunk = JSON.parse(data) as string;
              accumRef.current += chunk;
              setText(accumRef.current);
            } catch { /* ignore */ }
          } else if (event === 'error') {
            try {
              const j = JSON.parse(data);
              setError(j.message ?? 'stream error');
            } catch { setError('stream error'); }
          } else if (event === 'done') {
            // server has persisted; nothing else to do
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast.error('RCA stream failed');
    } finally {
      setStreaming(false);
    }
  }

  // Auto-start if the incident has no RCA yet — surfaces the headline feature.
  useEffect(() => {
    if (!initial) {
      // small delay so the page paints first
      const t = setTimeout(() => generate(), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" /> AI root-cause analysis
          {streaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription className="flex items-center justify-between gap-2">
          <span>{model ? `model: ${model}` : 'Streams citations from the captured log snapshot and health window.'}</span>
          <Button size="sm" variant="outline" onClick={generate} disabled={streaming}>
            {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : text ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {text ? 'Regenerate' : 'Generate'}
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <div className="text-xs text-rose-400 mb-2">{error}</div>}
        {text ? (
          <div className="prose prose-invert max-w-none text-sm">
            <pre className="whitespace-pre-wrap font-sans leading-relaxed">{text}{streaming && <span className="inline-block w-2 h-4 bg-foreground/60 align-text-bottom animate-pulse ml-0.5" />}</pre>
          </div>
        ) : !streaming ? (
          <div className="text-sm text-muted-foreground">No analysis yet. Click <em>Generate</em> to produce one. Without <code className="text-[10px]">OPENROUTER_API_KEY</code>, a heuristic fallback is used.</div>
        ) : (
          <div className="text-sm text-muted-foreground">Streaming…</div>
        )}
      </CardContent>
    </Card>
  );
}
