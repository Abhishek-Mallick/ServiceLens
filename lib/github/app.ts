// GitHub App client: the identity ServiceLens uses to read private repos and
// open fix PRs.
//
// The installation is looked up per repository (GET /repos/{o}/{r}/installation),
// so one ServiceLens deployment can work across every org or account that
// installed the App. GITHUB_APP_INSTALLATION_ID is not needed.
//
// Env: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM, "\n"-escaped PEM, or
// base64-encoded PEM). Optional GITHUB_API_URL for GitHub Enterprise Server.

import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';
import { parseRepoUrl } from '@/lib/ingest/github-client';

export function githubApiUrl(): string {
  return (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
}

export function githubAppConfigured(): boolean {
  return !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

export class GithubAppError extends Error {
  constructor(
    public code: 'not_configured' | 'not_installed' | 'bad_repo' | 'auth',
    message: string,
    public installUrl?: string
  ) {
    super(message);
    this.name = 'GithubAppError';
  }
}

// Accept the three ways people paste a PEM into an env var.
export function normalizePrivateKey(raw: string): string {
  const v = raw.trim().replace(/^"|"$/g, '');
  if (v.includes('-----BEGIN')) return v.replace(/\\n/g, '\n');
  const decoded = Buffer.from(v, 'base64').toString('utf8');
  if (decoded.includes('-----BEGIN')) return decoded;
  throw new GithubAppError('auth', 'GITHUB_APP_PRIVATE_KEY is not a PEM key (paste the .pem contents, or base64 of it).');
}

export function appJwt(nowMs: number = Date.now()): string {
  if (!githubAppConfigured()) throw new GithubAppError('not_configured', 'GitHub App is not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY).');
  const iat = Math.floor(nowMs / 1000) - 60; // allow for clock drift
  return jwt.sign({ iat, exp: iat + 9 * 60, iss: String(process.env.GITHUB_APP_ID) }, normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY!), {
    algorithm: 'RS256',
  });
}

function appOctokit(): Octokit {
  return new Octokit({ auth: appJwt(), baseUrl: githubApiUrl(), userAgent: 'servicelens-app/1.0' });
}

let appSlug: string | null = null;
// `state` comes back to /api/github/setup after install so we can return the
// user to the architecture they started from.
export async function installUrl(state?: string): Promise<string | undefined> {
  try {
    if (!appSlug) appSlug = (await appOctokit().apps.getAuthenticated()).data?.slug ?? null;
    if (!appSlug) return undefined;
    return `https://github.com/apps/${appSlug}/installations/new${state ? `?state=${encodeURIComponent(state)}` : ''}`;
  } catch {
    return undefined;
  }
}

// Which repos can the App reach? installed: true | false | null (unknown —
// App not configured or GitHub unreachable). Cached for a minute per repo.
const coverageCache = new Map<string, { installed: boolean; at: number }>();
export function clearCoverageCache() {
  coverageCache.clear();
}

export async function repoCoverage(repoUrls: string[]): Promise<Array<{ repoUrl: string; fullName: string | null; installed: boolean | null }>> {
  const out: Array<{ repoUrl: string; fullName: string | null; installed: boolean | null }> = [];
  for (const repoUrl of Array.from(new Set(repoUrls))) {
    const ref = parseRepoUrl(repoUrl);
    if (!ref) {
      out.push({ repoUrl, fullName: null, installed: null });
      continue;
    }
    const fullName = `${ref.owner}/${ref.repo}`;
    if (!githubAppConfigured()) {
      out.push({ repoUrl, fullName, installed: null });
      continue;
    }
    const hit = coverageCache.get(fullName.toLowerCase());
    if (hit && Date.now() - hit.at < 60_000) {
      out.push({ repoUrl, fullName, installed: hit.installed });
      continue;
    }
    let installed: boolean | null;
    try {
      await appOctokit().apps.getRepoInstallation({ owner: ref.owner, repo: ref.repo });
      installed = true;
    } catch (err) {
      installed = (err as { status?: number }).status === 404 ? false : null;
    }
    if (installed !== null) coverageCache.set(fullName.toLowerCase(), { installed, at: Date.now() });
    out.push({ repoUrl, fullName, installed });
  }
  return out;
}

// Installation tokens live 1h; cache per installation and refresh 5 min early.
const tokenCache = new Map<number, { token: string; expiresAt: number }>();

async function installationToken(installationId: number): Promise<string> {
  const hit = tokenCache.get(installationId);
  if (hit && hit.expiresAt - Date.now() > 5 * 60_000) return hit.token;
  const { data } = await appOctokit().apps.createInstallationAccessToken({ installation_id: installationId });
  tokenCache.set(installationId, { token: data.token, expiresAt: new Date(data.expires_at).getTime() });
  return data.token;
}

export interface RepoClient {
  octokit: Octokit;
  owner: string;
  repo: string;
  installationId: number;
}

export async function clientForRepo(repoUrl: string): Promise<RepoClient> {
  const ref = parseRepoUrl(repoUrl);
  if (!ref) throw new GithubAppError('bad_repo', `Not a GitHub repository URL: ${repoUrl}`);
  if (!githubAppConfigured()) throw new GithubAppError('not_configured', 'GitHub App is not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY).');

  let installationId: number;
  try {
    const { data } = await appOctokit().apps.getRepoInstallation({ owner: ref.owner, repo: ref.repo });
    installationId = data.id;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      throw new GithubAppError(
        'not_installed',
        `The ServiceLens GitHub App isn't installed on ${ref.owner}/${ref.repo}. Install it on that repository to let ServiceLens open PRs.`,
        await installUrl()
      );
    }
    if (status === 401) throw new GithubAppError('auth', 'GitHub rejected the App credentials. Check GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
    throw err;
  }
  const token = await installationToken(installationId);
  return {
    octokit: new Octokit({ auth: token, baseUrl: githubApiUrl(), userAgent: 'servicelens-app/1.0' }),
    owner: ref.owner,
    repo: ref.repo,
    installationId,
  };
}

// Best token for reading a repo: the App's installation token when the App
// covers it (works for private repos), else GITHUB_TOKEN, else anonymous.
export async function readTokenForRepo(repoUrl: string): Promise<string | undefined> {
  if (githubAppConfigured()) {
    try {
      const ref = parseRepoUrl(repoUrl);
      if (ref) {
        const { data } = await appOctokit().apps.getRepoInstallation({ owner: ref.owner, repo: ref.repo });
        return await installationToken(data.id);
      }
    } catch {
      /* not installed there — fall through */
    }
  }
  return process.env.GITHUB_TOKEN || undefined;
}

export function _resetGithubAppCacheForTests() {
  tokenCache.clear();
  coverageCache.clear();
  appSlug = null;
}
