import type { AIAnalysisResult } from './types';
import type { ExtractedFile as GitFile } from './git-analyzer';

export function detectLanguage(files: GitFile[]): { language: string; framework: string } {
  const names = new Set(files.map((f) => f.path.split('/').pop()));
  if (names.has('package.json')) {
    const pkg = files.find((f) => f.path.endsWith('package.json'));
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg.content);
        const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
        if (deps['@nestjs/core']) return { language: 'TypeScript', framework: 'NestJS' };
        if (deps['next']) return { language: 'TypeScript', framework: 'Next.js' };
        if (deps['express']) return { language: 'Node.js', framework: 'Express' };
        if (deps['fastify']) return { language: 'Node.js', framework: 'Fastify' };
        if (deps['koa']) return { language: 'Node.js', framework: 'Koa' };
      } catch {}
    }
    return { language: 'JavaScript', framework: 'Node.js' };
  }
  if (names.has('pom.xml') || names.has('build.gradle')) return { language: 'Java', framework: 'Spring Boot' };
  if (names.has('pyproject.toml') || names.has('requirements.txt')) return { language: 'Python', framework: 'FastAPI' };
  if (names.has('go.mod')) return { language: 'Go', framework: 'Standard' };
  if (names.has('Cargo.toml')) return { language: 'Rust', framework: 'Standard' };
  return { language: 'Unknown', framework: 'Unknown' };
}

// Lightweight fallback analyzer for when AI is unavailable.
export function heuristicAnalyze(serviceName: string, files: GitFile[]): AIAnalysisResult {
  const { language, framework } = detectLanguage(files);
  const produces: Array<{ name: string; topic?: string }> = [];
  const consumes: Array<{ name: string; topic?: string }> = [];
  const apis: Array<{ method: string; path: string; description?: string }> = [];
  const topics = new Set<string>();

  for (const f of files) {
    const text = f.content;
    const topicMatches = text.match(/topic[s]?\s*[:=]\s*['"`]([A-Za-z0-9._-]+)['"`]/gi) || [];
    for (const m of topicMatches) {
      const match = m.match(/['"`]([A-Za-z0-9._-]+)['"`]/);
      if (match?.[1]) topics.add(match[1]);
    }
    const produceMatches = text.match(/(produce|emit|publish)\s*\(\s*['"`]([A-Za-z0-9._-]+)['"`]/gi) || [];
    for (const m of produceMatches) {
      const match = m.match(/['"`]([A-Za-z0-9._-]+)['"`]/);
      if (match?.[1]) produces.push({ name: match[1] });
    }
    const consumeMatches = text.match(/(consume|subscribe|on)\s*\(\s*['"`]([A-Za-z0-9._-]+)['"`]/gi) || [];
    for (const m of consumeMatches) {
      const match = m.match(/['"`]([A-Za-z0-9._-]+)['"`]/);
      if (match?.[1]) consumes.push({ name: match[1] });
    }
    const routeMatches = text.match(/\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi) || [];
    for (const m of routeMatches) {
      const parts = m.match(/\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (parts) apis.push({ method: parts[1].toUpperCase(), path: parts[2] });
    }
  }

  return {
    language,
    framework,
    producesEvents: produces.slice(0, 10),
    consumesEvents: consumes.slice(0, 10),
    exposesApis: apis.slice(0, 15),
    consumesApis: [],
    databases: [],
    kafkaTopics: Array.from(topics),
    healthEndpoint: apis.find((a) => /health/i.test(a.path))?.path ?? null,
    summary: `${serviceName}: ${framework} service (heuristic analysis).`,
  };
}

export type { GitFile as ExtractedFile };
