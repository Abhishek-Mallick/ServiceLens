import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ExternalLink, Github, HelpCircle, XCircle } from 'lucide-react';

interface RepoRow { repoUrl: string; fullName: string | null; installed: boolean | null; services: string[] }

// Which service repos the ServiceLens GitHub App can reach (needed to open fix
// PRs and read private repos), with a one-click install that returns here.
export function GithubPanel({
  configured,
  installUrl,
  repos,
  justChanged,
}: {
  configured: boolean;
  installUrl: string | null;
  repos: RepoRow[];
  justChanged: string | null;
}) {
  const missing = repos.filter((r) => r.installed === false).length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><Github className="h-4 w-4" /> GitHub</CardTitle>
          <CardDescription>
            The ServiceLens GitHub App reads private repos and opens draft fix PRs. It only works on repositories it&apos;s installed on.
          </CardDescription>
        </div>
        {configured && installUrl && (
          <Button asChild size="sm" variant={missing ? 'default' : 'outline'}>
            <a href={installUrl}>{missing ? `Install on ${missing} more repo${missing === 1 ? '' : 's'}` : 'Manage installation'} <ExternalLink className="h-3.5 w-3.5" /></a>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {justChanged && <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-[12px] text-emerald-400">GitHub App {justChanged === 'update' ? 'access updated' : 'installed'}. Coverage below is refreshed.</div>}
        {!configured && (
          <p className="text-[13px] text-muted-foreground">
            Not configured on this deployment. An admin needs to create the App and set <code>GITHUB_APP_ID</code> / <code>GITHUB_APP_PRIVATE_KEY</code> (see <code>docs/secrets.md</code>).
            Public repos are still analyzed; fix PRs can be copied as a patch.
          </p>
        )}
        {repos.length === 0 && <div className="text-sm text-muted-foreground">No services yet.</div>}
        {repos.map((r) => (
          <div key={r.repoUrl} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-[13px]">
            {r.installed === true ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : r.installed === false ? <XCircle className="h-4 w-4 text-amber-400" /> : <HelpCircle className="h-4 w-4 text-muted-foreground" />}
            <a href={r.repoUrl} target="_blank" rel="noreferrer" className="font-mono hover:underline">{r.fullName ?? r.repoUrl}</a>
            <span className="text-muted-foreground truncate">· {r.services.join(', ')}</span>
            <span className="ml-auto text-[12px] text-muted-foreground">
              {r.installed === true ? 'fix PRs enabled' : r.installed === false ? 'App not installed' : configured ? 'could not check' : '—'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
