import type { Octokit } from '@octokit/rest';
import type { RepoRef } from './github-client';

export interface TreeEntry { path: string; type: 'blob' | 'tree'; size?: number }

const MAX_FILES = 200;
const MAX_FILE_BYTES = 200_000;
const READ_CONCURRENCY = 8;

const SOURCE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;
const EXCLUDE_DIR_RE = /(?:^|\/)(?:node_modules|\.next|dist|build|coverage|\.git)(?:\/|$)/;

export function isInteresting(p: string): boolean {
  if (EXCLUDE_DIR_RE.test(p)) return false;
  if (p === '.env.example' || p === 'package.json' || p === 'README.md') return true;
  if (/^src\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^app\//.test(p) && /\/route\.(ts|js|tsx|jsx)$/.test(p)) return true;
  if (/^pages\/api\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^api\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^routes\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  return false;
}

// Resolve the branch to a commit. If the configured branch doesn't exist
// (e.g. "main" on a "master" repo), fall back to the repo's default branch.
async function resolveCommit(octokit: Octokit, ref: RepoRef): Promise<{ commitSha: string; branch: string }> {
  try {
    const b = await octokit.repos.getBranch({ owner: ref.owner, repo: ref.repo, branch: ref.branch });
    return { commitSha: b.data.commit.sha, branch: ref.branch };
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
    const repo = await octokit.repos.get({ owner: ref.owner, repo: ref.repo });
    const fallback = repo.data.default_branch;
    if (!fallback || fallback === ref.branch) throw err;
    const b = await octokit.repos.getBranch({ owner: ref.owner, repo: ref.repo, branch: fallback });
    return { commitSha: b.data.commit.sha, branch: fallback };
  }
}

export async function listInterestingTree(
  octokit: Octokit,
  ref: RepoRef,
): Promise<{ commitSha: string; branch: string; entries: TreeEntry[] }> {
  const { commitSha, branch } = await resolveCommit(octokit, ref);
  const tree = await octokit.git.getTree({
    owner: ref.owner,
    repo: ref.repo,
    tree_sha: commitSha,
    recursive: 'true',
  });
  const all = (tree.data.tree ?? []).filter((e): e is TreeEntry => !!e.path && (e.type === 'blob' || e.type === 'tree')) as TreeEntry[];
  const interesting = all
    .filter((e) => e.type === 'blob' && isInteresting(e.path) && (e.size ?? 0) <= MAX_FILE_BYTES)
    .slice(0, MAX_FILES);
  return { commitSha, branch, entries: interesting };
}

// Read one file at an exact commit. Without a token, public repos are read from
// raw.githubusercontent.com, which doesn't count against the 60 req/hr
// unauthenticated API limit. With a token we go through the API so private
// repos work.
export async function readFile(
  octokit: Octokit,
  ref: RepoRef,
  filePath: string,
  commitSha: string,
  opts: { authenticated: boolean },
): Promise<string | null> {
  if (!opts.authenticated) {
    const url = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${commitSha}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error(`raw fetch ${filePath}: HTTP ${res.status}`), { status: res.status });
    const text = await res.text();
    return text.length > MAX_FILE_BYTES ? null : text;
  }

  const res = await octokit.repos.getContent({
    owner: ref.owner,
    repo: ref.repo,
    path: filePath,
    ref: commitSha,
  });
  if (Array.isArray(res.data)) return null;
  const data = res.data as { type?: string; size?: number; content?: string; encoding?: string };
  if (data.type !== 'file' || !data.content) return null;
  if ((data.size ?? 0) > MAX_FILE_BYTES) return null;
  if (data.encoding !== 'base64') return null;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

export async function readFiles(
  octokit: Octokit,
  ref: RepoRef,
  paths: string[],
  commitSha: string,
  opts: { authenticated: boolean },
): Promise<Array<{ path: string; content: string }>> {
  const out: Array<{ path: string; content: string } | null> = new Array(paths.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(READ_CONCURRENCY, paths.length) }, async () => {
      while (next < paths.length) {
        const i = next++;
        const content = await readFile(octokit, ref, paths[i], commitSha, opts);
        if (content != null) out[i] = { path: paths[i], content };
      }
    })
  );
  return out.filter((f): f is { path: string; content: string } => f != null);
}
