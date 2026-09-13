import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatRelative } from '@/lib/utils';
import type { Endpoint, OutboundDep } from '@/lib/ingest/types';

interface Props {
  repoUrl: string;
  analysisStatus: string;
  analysisError: string | null;
  contract: { commitSha: string | null; extractedAt: Date; framework: string | null; endpoints: Endpoint[]; outboundDeps: OutboundDep[] } | null;
  resolved: Record<string, string>; // envVar → target service name
  coverage: { installed: boolean | null } | null;
}

// What ServiceLens read from the service's repository, with links to the exact lines.
export function AnalysisCard({ repoUrl, analysisStatus, analysisError, contract, resolved, coverage }: Props) {
  const base = repoUrl.replace(/\.git$/, '').replace(/\/+$/, '');
  const link = (file: string, line: number) => (contract?.commitSha ? `${base}/blob/${contract.commitSha}/${file}#L${line}` : `${base}`);
  const deps = contract ? Array.from(new Map(contract.outboundDeps.map((d) => [d.envVar, d])).values()) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-3">Repository analysis <StatusBadge status={analysisStatus} /></CardTitle>
        <CardDescription>
          {contract ? (
            <>
              {contract.framework ?? 'unknown framework'} · read at <code>{contract.commitSha?.slice(0, 7) ?? '—'}</code> {formatRelative(contract.extractedAt)}
              {coverage && (
                <> · GitHub App: {coverage.installed === true ? <span className="text-accent-green">installed</span> : coverage.installed === false ? <span className="text-accent-yellow">not installed (no fix PRs)</span> : 'unknown'}</>
              )}
            </>
          ) : analysisStatus === 'error' ? 'The last analysis failed.' : 'Not analyzed yet.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {analysisError && <div className="rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-[13px] text-accent-red">{analysisError}</div>}
        {contract && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.15em] text-mute">Endpoints ({contract.endpoints.length})</div>
              {contract.endpoints.length === 0 && <div className="text-xs text-mute">No routes found. Supported today: Express and Next.js.</div>}
              {contract.endpoints.map((e, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-hairline px-2 py-1.5">
                  <Badge variant="outline" className="font-mono text-[10px]">{e.method}</Badge>
                  <span className="text-[13px] font-mono truncate">{e.path}</span>
                  <a href={link(e.file, e.line)} target="_blank" rel="noreferrer" className="ml-auto text-[11px] font-mono text-mute hover:underline truncate">{e.file}:{e.line}</a>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.15em] text-mute">Calls other services ({deps.length})</div>
              {deps.length === 0 && <div className="text-xs text-mute">No outbound service URLs found in the code.</div>}
              {deps.map((d) => (
                <div key={d.envVar} className="flex items-center gap-2 rounded-md border border-hairline px-2 py-1.5">
                  <code className="text-[12px] truncate">{d.envVar}</code>
                  <span className="text-[12px]">→ {resolved[d.envVar] ? <strong>{resolved[d.envVar]}</strong> : <span className="text-accent-yellow">unmatched</span>}</span>
                  <a href={link(d.file, d.line)} target="_blank" rel="noreferrer" className="ml-auto text-[11px] font-mono text-mute hover:underline truncate">{d.file}:{d.line}</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
