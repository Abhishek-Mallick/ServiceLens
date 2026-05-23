import { EXPRESS_ROUTE_RE, NEXT_APP_METHOD_RE } from './patterns';
import type { Endpoint } from './types';

interface SourceFile { path: string; content: string }

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function nextAppPathFromFile(filePath: string): string | null {
  const m = filePath.match(/^app\/(.+)\/route\.(?:ts|js|tsx|jsx)$/);
  if (!m) return null;
  const segments = m[1].split('/').filter(Boolean);
  const clean = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  return '/' + clean.map((s) => s.replace(/^\[(?:\.{3})?(.+)\]$/, ':$1')).join('/');
}

function nextPagesPathFromFile(filePath: string): string | null {
  const m = filePath.match(/^pages\/api\/(.+)\.(?:ts|js|tsx|jsx)$/);
  if (!m) return null;
  let rel = m[1].replace(/\/index$/, '');
  rel = rel.replace(/\[(?:\.{3})?(.+?)\]/g, ':$1');
  return '/api/' + rel;
}

export function extractEndpoints(files: SourceFile[]): Endpoint[] {
  const out: Endpoint[] = [];

  for (const f of files) {
    EXPRESS_ROUTE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXPRESS_ROUTE_RE.exec(f.content)) !== null) {
      const method = m[1].toUpperCase();
      if (method === 'USE') continue;
      out.push({
        method: method === 'ALL' ? 'ANY' : method,
        path: m[2],
        file: f.path,
        line: lineOf(f.content, m.index),
      });
    }

    const appPath = nextAppPathFromFile(f.path);
    if (appPath) {
      NEXT_APP_METHOD_RE.lastIndex = 0;
      while ((m = NEXT_APP_METHOD_RE.exec(f.content)) !== null) {
        out.push({
          method: m[1],
          path: appPath,
          file: f.path,
          line: lineOf(f.content, m.index),
        });
      }
    }

    const pagesPath = nextPagesPathFromFile(f.path);
    if (pagesPath && /export\s+default\s+/.test(f.content)) {
      out.push({
        method: 'ANY',
        path: pagesPath,
        file: f.path,
        line: 1,
      });
    }
  }

  return out;
}
