import type { Octokit } from '@octokit/rest';
import type { RepoRef } from './github-client';

export interface TreeEntry { path: string; type: 'blob' | 'tree'; size?: number }

const MAX_FILES = 200;
const MAX_FILE_BYTES = 200_000;

const SOURCE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;
const EXCLUDE_DIR_RE = /(?:^|\/)(?:node_modules|\.next|dist|build|coverage|\.git)(?:\/|$)/;

function isInteresting(p: string): boolean {
  if (EXCLUDE_DIR_RE.test(p)) return false;
  if (p === '.env.example' || p === 'package.json' || p === 'README.md') return true;
  if (/^src\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^app\//.test(p) && /\/route\.(ts|js|tsx|jsx)$/.test(p)) return true;
  if (/^pages\/api\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^api\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^routes\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  return false;
}

export async function listInterestingTree(
  octokit: Octokit,
  ref: RepoRef,
): Promise<{ commitSha: string; entries: TreeEntry[] }> {
  const branch = await octokit.repos.getBranch({ owner: ref.owner, repo: ref.repo, branch: ref.branch });
  const commitSha = branch.data.commit.sha;
  const tree = await octokit.git.getTree({
    owner: ref.owner,
    repo: ref.repo,
    tree_sha: commitSha,
    recursive: 'true',
  });
  const all = (tree.data.tree ?? []).filter((e): e is TreeEntry => !!e.path && (e.type === 'blob' || e.type === 'tree')) as TreeEntry[];
  const interesting = all.filter((e) => e.type === 'blob' && isInteresting(e.path)).slice(0, MAX_FILES);
  return { commitSha, entries: interesting };
}

export async function readFile(
  octokit: Octokit,
  ref: RepoRef,
  filePath: string,
): Promise<string | null> {
  const res = await octokit.repos.getContent({
    owner: ref.owner,
    repo: ref.repo,
    path: filePath,
    ref: ref.branch,
  });
  if (Array.isArray(res.data)) return null;
  const data = res.data as { type?: string; size?: number; content?: string; encoding?: string };
  if (data.type !== 'file' || !data.content) return null;
  if ((data.size ?? 0) > MAX_FILE_BYTES) return null;
  if (data.encoding !== 'base64') return null;
  return Buffer.from(data.content, 'base64').toString('utf8');
}
