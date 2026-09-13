'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Download, ExternalLink, FileText, GitPullRequest, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilePatch { path: string; patch: string }
interface FixPr {
  summary: string;
  branchName: string;
  files: FilePatch[];
  prTitle: string;
  prBody: string;
  repo?: string;
  baseBranch?: string;
  baseSha?: string;
  model?: string;
}
interface Remediation {
  status: 'opening' | 'opened' | 'failed';
  prUrl: string | null;
  prNumber: number | null;
  prState: string | null;
  draft: boolean;
  repoFullName: string | null;
  error: string | null;
  auto: boolean;
}
interface ApiError { message: string; installUrl?: string | null }

function colorLine(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-muted-foreground';
  if (line.startsWith('@@')) return 'text-sky-400';
  if (line.startsWith('+')) return 'text-emerald-400';
  if (line.startsWith('-')) return 'text-rose-400';
  return 'text-muted-foreground';
}

const STATE_STYLE: Record<string, string> = {
  open: 'border-emerald-500/40 text-emerald-400',
  merged: 'border-violet-500/40 text-violet-400',
  closed: 'border-rose-500/40 text-rose-400',
};

export function FixPrPanel({ incidentId, hasRca, canEdit = true }: { incidentId: string; hasRca: boolean; canEdit?: boolean }) {
  const [fix, setFix] = useState<FixPr | null>(null);
  const [committable, setCommittable] = useState(false);
  const [remediation, setRemediation] = useState<Remediation | null>(null);
  const [githubConfigured, setGithubConfigured] = useState(false);
  const [busy, setBusy] = useState<'gen' | 'open' | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  useEffect(() => {
    fetch(`/api/incidents/${incidentId}/fix-pr`)
      .then((r) => r.json())
      .then((j) => {
        setFix(j.fix ?? null);
        setCommittable(!!j.committable);
        setRemediation(j.remediation ?? null);
        setGithubConfigured(!!j.githubApp?.configured);
      })
      .catch(() => {});
  }, [incidentId]);

  async function generate() {
    setBusy('gen');
    setErr(null);
    const r = await fetch(`/api/incidents/${incidentId}/fix-pr`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setErr({ message: j.error ?? 'Fix generation failed' });
      toast.error(r.status === 422 ? 'No code fix proposed' : 'Fix generation failed');
      return;
    }
    setFix(j.fix);
    setCommittable(!!j.committable);
    toast.success('Fix generated from the service source');
  }

  async function openPr() {
    setBusy('open');
    setErr(null);
    const r = await fetch(`/api/incidents/${incidentId}/fix-pr/open`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setErr({ message: j.error ?? 'Could not open the pull request', installUrl: j.installUrl });
      toast.error('Could not open the pull request');
      return;
    }
    setRemediation(j.remediation);
    toast.success(`${j.remediation.draft ? 'Draft PR' : 'PR'} #${j.remediation.prNumber} opened`);
  }

  function patchText() {
    return fix ? fix.files.map((f) => f.patch.trim() + '\n').join('\n') : '';
  }

  function copyPatch() {
    navigator.clipboard.writeText(patchText());
    toast.success('Patch copied');
  }

  function downloadPatch() {
    if (!fix) return;
    const blob = new Blob([patchText()], { type: 'text/x-patch' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fix.branchName.replace(/[^a-zA-Z0-9_-]+/g, '-')}.patch`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  const opened = remediation?.status === 'opened' && remediation.prUrl;
  const canOpen = canEdit && fix && committable && !opened && githubConfigured;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-400" /> AI fix PR
        </CardTitle>
        <CardDescription className="flex items-center justify-between gap-2">
          <span>Generated from the RCA and the service&apos;s real source files. ServiceLens opens draft PRs only and never merges.</span>
          {canEdit && !opened && (
            <Button size="sm" variant={fix ? 'outline' : 'default'} onClick={generate} disabled={busy !== null}>
              {busy === 'gen' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {fix ? 'Regenerate' : 'Generate fix'}
            </Button>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {err && (
          <div className="text-xs text-rose-400 mb-3">
            {err.message}
            {err.installUrl && (
              <> <a href={err.installUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">Install the GitHub App <ExternalLink className="h-3 w-3" /></a></>
            )}
          </div>
        )}
        {busy === 'gen' && <div className="text-sm text-muted-foreground mb-3">Reading the service source and asking the model for a fix. This can take up to a minute.</div>}
        {!hasRca && !fix && busy === null && !err && <div className="text-xs text-muted-foreground">The fix is built from the root-cause analysis above, so generate it once the RCA has finished.</div>}
        {hasRca && !fix && busy === null && !err && (
          <div className="text-sm text-muted-foreground">{canEdit ? <>No fix yet. Click <em>Generate fix</em>.</> : 'No fix has been generated yet.'}</div>
        )}

        {opened && remediation && (
          <div className="rounded-md border border-border/60 p-3 mb-3 flex flex-wrap items-center gap-3">
            <GitPullRequest className="h-4 w-4 text-emerald-400" />
            <a href={remediation.prUrl!} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline inline-flex items-center gap-1">
              {remediation.repoFullName}#{remediation.prNumber} <ExternalLink className="h-3 w-3" />
            </a>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide', STATE_STYLE[remediation.prState ?? 'open'])}>
              {remediation.prState === 'open' && remediation.draft ? 'draft' : remediation.prState}
            </span>
            {remediation.auto && <span className="text-[11px] text-muted-foreground">opened automatically</span>}
          </div>
        )}

        {fix && (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 p-3 space-y-1">
              <div className="text-sm font-medium">{fix.prTitle}</div>
              <div className="text-xs text-muted-foreground">
                {fix.repo && <>{fix.repo} · </>}branch <code className="text-[11px] font-mono">{fix.branchName}</code>
                {fix.baseSha && <> · from <code className="text-[11px] font-mono">{fix.baseBranch}@{fix.baseSha.slice(0, 7)}</code></>}
              </div>
              <div className="text-xs text-muted-foreground">{fix.summary}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canOpen && (
                <Button size="sm" onClick={openPr} disabled={busy !== null}>
                  {busy === 'open' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5" />}
                  Open draft PR
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={copyPatch}><Copy className="h-3.5 w-3.5" />Copy as patch</Button>
              <Button size="sm" variant="outline" onClick={downloadPatch}><Download className="h-3.5 w-3.5" />Download .patch</Button>
              <span className="text-[11px] text-muted-foreground ml-auto">{fix.files.length} file{fix.files.length === 1 ? '' : 's'}</span>
            </div>
            {!opened && canEdit && !githubConfigured && (
              <p className="text-[11px] text-muted-foreground">To open PRs directly, configure the ServiceLens GitHub App (see docs/secrets.md). You can still copy the patch.</p>
            )}
            {!opened && fix && !committable && (
              <p className="text-[11px] text-muted-foreground">This proposal predates source-based fixes. Regenerate it to open it as a PR.</p>
            )}

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
              <summary className="text-xs cursor-pointer text-muted-foreground">PR description (preview)</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{fix.prBody}</pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
