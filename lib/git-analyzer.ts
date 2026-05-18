import simpleGit from 'simple-git';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Phase 7 safety hardening. Public Git URLs are user-supplied, so every clone
// must validate the URL scheme, time out aggressively, sandbox into a fresh
// tmpdir, and bail if the checkout balloons past the size cap.
const CLONE_TIMEOUT_MS = 30_000;
const REPO_SIZE_CAP_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function validateRepoUrl(repoUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(repoUrl); } catch { return { ok: false, reason: 'malformed URL' }; }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: `protocol ${url.protocol} not allowed (use http(s))` };
  // Block private network targets — best-effort, since DNS can still resolve to private space.
  // The downstream Git operation is also network-bounded by the timeout below.
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/i.test(url.hostname)) {
    return { ok: false, reason: 'private/loopback host not allowed' };
  }
  return { ok: true, url };
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: { name: string; isDir: boolean }[] = [];
    try {
      const items = await fs.readdir(cur, { withFileTypes: true });
      entries = items.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
    } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDir) { stack.push(full); continue; }
      try { total += (await fs.stat(full)).size; if (total > REPO_SIZE_CAP_BYTES) return total; } catch {}
    }
  }
  return total;
}

const INTERESTING_FILES = [
  'package.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'application.yml',
  'application.yaml',
  'application.properties',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  '.env.example',
  'README.md',
];

const INTERESTING_DIRS = ['src', 'app', 'internal', 'cmd', 'pkg', 'k8s', 'deploy', 'kubernetes', 'config', 'routes', 'controllers', 'handlers', 'events', 'consumers', 'producers'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.kt', '.rs', '.rb', '.yaml', '.yml']);

export interface ExtractedFile {
  path: string;
  content: string;
}

export async function cloneShallow(repoUrl: string, branch = 'main'): Promise<string> {
  const validated = validateRepoUrl(repoUrl);
  if (!validated.ok) throw new Error(`Refused to clone: ${validated.reason}`);

  // Sandbox into a fresh tmpdir under the OS temp root. Cleaned up by the
  // caller via cleanup() after the analysis pass — we don't try to mutate
  // anything outside this dir.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'servicelens-'));

  const git = simpleGit({ timeout: { block: CLONE_TIMEOUT_MS } });
  try {
    await git.clone(repoUrl, tmpDir, ['--depth', '1', '--branch', branch, '--single-branch']);
  } catch (err) {
    await cleanup(tmpDir);
    throw err instanceof Error ? err : new Error(String(err));
  }

  const size = await dirSize(tmpDir);
  if (size > REPO_SIZE_CAP_BYTES) {
    await cleanup(tmpDir);
    throw new Error(`Refused to analyze: checkout size ${(size / 1_048_576).toFixed(1)} MB exceeds ${REPO_SIZE_CAP_BYTES / 1_048_576} MB cap`);
  }
  return tmpDir;
}

export async function extractKeyFiles(repoPath: string, maxFiles = 25, maxBytes = 120_000): Promise<ExtractedFile[]> {
  const collected: ExtractedFile[] = [];
  let totalBytes = 0;

  for (const f of INTERESTING_FILES) {
    const full = path.join(repoPath, f);
    try {
      const stat = await fs.stat(full);
      if (stat.isFile() && stat.size < 20_000) {
        const content = await fs.readFile(full, 'utf-8');
        collected.push({ path: f, content });
        totalBytes += stat.size;
      }
    } catch {}
  }

  async function walk(dir: string, relBase = ''): Promise<void> {
    if (collected.length >= maxFiles || totalBytes >= maxBytes) return;
    let entries: { name: string; isDir: boolean; isFile: boolean }[] = [];
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      entries = items.map((d) => ({ name: d.name, isDir: d.isDirectory(), isFile: d.isFile() }));
    } catch {
      return;
    }
    for (const e of entries) {
      if (collected.length >= maxFiles || totalBytes >= maxBytes) return;
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'build' || e.name === 'target') continue;
      const full = path.join(dir, e.name);
      const rel = relBase ? `${relBase}/${e.name}` : e.name;
      if (e.isDir) {
        await walk(full, rel);
      } else if (e.isFile) {
        const ext = path.extname(e.name);
        if (!SOURCE_EXTENSIONS.has(ext)) continue;
        const looksRelevant = /(route|controller|handler|event|consumer|producer|kafka|api|main|index|app)/i.test(e.name);
        if (!looksRelevant) continue;
        try {
          const stat = await fs.stat(full);
          if (stat.size > 30_000) continue;
          const content = await fs.readFile(full, 'utf-8');
          collected.push({ path: rel, content });
          totalBytes += stat.size;
        } catch {}
      }
    }
  }

  for (const d of INTERESTING_DIRS) {
    if (collected.length >= maxFiles || totalBytes >= maxBytes) break;
    const full = path.join(repoPath, d);
    try {
      const stat = await fs.stat(full);
      if (stat.isDirectory()) await walk(full, d);
    } catch {}
  }

  return collected;
}

export async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {}
}
