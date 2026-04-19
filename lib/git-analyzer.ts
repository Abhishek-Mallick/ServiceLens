import simpleGit from 'simple-git';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

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
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meshregress-'));
  const git = simpleGit();
  await git.clone(repoUrl, tmpDir, ['--depth', '1', '--branch', branch]);
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
