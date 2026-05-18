'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Download, FileText, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilePatch { path: string; patch: string }
interface FixPr {
  summary: string;
  branchName: string;
  files: FilePatch[];
  prTitle: string;
  prBody: string;
}

function colorLine(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-muted-foreground';
  if (line.startsWith('@@')) return 'text-sky-400';
  if (line.startsWith('+')) return 'text-emerald-400';
  if (line.startsWith('-')) return 'text-rose-400';
  return 'text-muted-foreground';
}

export function FixPrPanel({ incidentId, hasRca }: { incidentId: string; hasRca: boolean }) {
  const [fix, setFix] = useState<FixPr | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/incidents/${incidentId}/fix-pr`).then((r) => r.json()).then((j) => setFix(j.fix ?? null));
  }, [incidentId]);

  async function generate() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/incidents/${incidentId}/fix-pr`, { method: 'POST' });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? 'fix-pr generation failed');
      toast.error('Fix PR generation failed');
      return;
    }
    const j = await r.json();
    setFix(j.fix);
    toast.success('Fix PR generated');
  }

  function copyPatch() {
    if (!fix) return;
    const patch = fix.files.map((f) => f.patch.trim() + '\n').join('\n');
    navigator.clipboard.writeText(patch);
    toast.success('Patch copied');
  }

  function downloadPatch() {
    if (!fix) return;
    const patch = fix.files.map((f) => f.patch.trim() + '\n').join('\n');
    const blob = new Blob([patch], { type: 'text/x-patch' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fix.branchName.replace(/[^a-zA-Z0-9_-]+/g, '-')}.patch`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-400" /> AI fix PR
        </CardTitle>
        <CardDescription className="flex items-center justify-between gap-2">
          <span>One conservative, surgical patch suggested by the model — preview here, apply with <code className="text-[10px]">git apply</code>.</span>
          <Button size="sm" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {fix ? 'Regenerate' : 'Generate fix PR'}
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {err && <div className="text-xs text-rose-400 mb-2">{err}</div>}
        {!hasRca && !fix && <div className="text-xs text-muted-foreground">Run the AI root-cause analysis first — this uses the RCA as its prompt context.</div>}
        {hasRca && !fix && !busy && <div className="text-sm text-muted-foreground">No suggested PR yet. Click <em>Generate fix PR</em>.</div>}
        {fix && (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 p-3 space-y-1">
              <div className="text-sm font-medium">{fix.prTitle}</div>
              <div className="text-xs text-muted-foreground">branch: <code className="text-[11px] font-mono">{fix.branchName}</code></div>
              <div className="text-xs text-muted-foreground">{fix.summary}</div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={copyPatch}><Copy className="h-3.5 w-3.5" />Copy as patch</Button>
              <Button size="sm" variant="outline" onClick={downloadPatch}><Download className="h-3.5 w-3.5" />Download .patch</Button>
              <span className="text-[11px] text-muted-foreground ml-auto">{fix.files.length} file{fix.files.length === 1 ? '' : 's'}</span>
            </div>

            {fix.files.map((f, i) => (
              <div key={i} className="rounded-md border border-border/60 overflow-hidden">
                <div className="px-3 py-1.5 border-b border-border/60 bg-muted/30 text-xs font-mono">{f.path}</div>
                <pre className="bg-black/40 text-[12px] font-mono leading-relaxed overflow-x-auto p-3 m-0">
                  {f.patch.split('\n').map((line, j) => (
                    <div key={j} className={cn(colorLine(line))}>{line || ' '}</div>
                  ))}
                </pre>
              </div>
            ))}

            <details className="rounded-md border border-border/60 p-3">
              <summary className="text-xs cursor-pointer text-muted-foreground">PR body (preview)</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{fix.prBody}</pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
