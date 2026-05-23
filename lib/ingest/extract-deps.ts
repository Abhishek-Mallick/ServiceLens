import { ENV_URL_RE, ENV_LINE_RE } from './patterns';
import type { OutboundDep } from './types';

interface SourceFile { path: string; content: string }

export function parseEnvExample(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  ENV_LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENV_LINE_RE.exec(content)) !== null) {
    const [, name, raw] = m;
    if (!name) continue;
    out[name] = raw.trim();
  }
  return out;
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function extractDeps(files: SourceFile[], envExample: Record<string, string>): OutboundDep[] {
  const seen = new Map<string, OutboundDep>();

  for (const f of files) {
    ENV_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ENV_URL_RE.exec(f.content)) !== null) {
      const envVar = m[1];
      if (seen.has(envVar)) continue;
      seen.set(envVar, {
        envVar,
        urlExample: envExample[envVar],
        file: f.path,
        line: lineOf(f.content, m.index),
      });
    }
  }

  return Array.from(seen.values());
}
