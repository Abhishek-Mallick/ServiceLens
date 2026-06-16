import { Octokit } from '@octokit/rest';

export function makeOctokit(token?: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: 'servicelens-ingest/0.1',
  });
}

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export function parseRepoUrl(repoUrl: string): RepoRef | null {
  const m = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: 'main' };
}
