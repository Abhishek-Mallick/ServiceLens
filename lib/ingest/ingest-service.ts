import { extractEndpoints } from './extract-endpoints';
import { extractDeps, parseEnvExample } from './extract-deps';
import { makeOctokit, parseRepoUrl } from './github-client';
import { listInterestingTree, readFile } from './github-contents';
import type { ServiceContract, EnvVar } from './types';

interface SourceFile { path: string; content: string }

function detectFramework(files: SourceFile[]): ServiceContract['framework'] {
  const pkg = files.find((f) => f.path === 'package.json');
  if (pkg) {
    try {
      const j = JSON.parse(pkg.content);
      const deps = { ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}) };
      if (deps.next) {
        if (files.some((f) => f.path.startsWith('app/') && /route\.(ts|js|tsx|jsx)$/.test(f.path))) return 'nextjs-app';
        if (files.some((f) => f.path.startsWith('pages/api/'))) return 'nextjs-pages';
        return 'nextjs-app';
      }
      if (deps.express) return 'express';
      if (deps.fastify) return 'fastify';
    } catch { /* fall through */ }
  }
  return 'unknown';
}

export function ingestFromFiles(files: SourceFile[], commitSha?: string): ServiceContract {
  const envExampleFile = files.find((f) => f.path === '.env.example');
  const envExample = envExampleFile ? parseEnvExample(envExampleFile.content) : {};

  const endpoints = extractEndpoints(files);
  const outboundDeps = extractDeps(files, envExample);
  const envVars: EnvVar[] = Object.entries(envExample).map(([name, defaultValue]) => ({ name, defaultValue }));

  return {
    endpoints,
    outboundDeps,
    envVars,
    framework: detectFramework(files),
    commitSha,
  };
}

export async function ingestService(opts: {
  repoUrl: string;
  branch?: string;
  githubToken?: string;
}): Promise<ServiceContract> {
  const ref = parseRepoUrl(opts.repoUrl);
  if (!ref) throw new Error(`Unsupported repo URL: ${opts.repoUrl}`);
  ref.branch = opts.branch ?? ref.branch;
  const octokit = makeOctokit(opts.githubToken);

  const { commitSha, entries } = await listInterestingTree(octokit, ref);

  const files: SourceFile[] = [];
  for (const entry of entries) {
    const content = await readFile(octokit, ref, entry.path);
    if (content != null) files.push({ path: entry.path, content });
  }

  return ingestFromFiles(files, commitSha);
}
