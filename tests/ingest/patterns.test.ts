import { describe, it, expect } from 'vitest';
import { EXPRESS_ROUTE_RE, ENV_URL_RE, ENV_LINE_RE, NEXT_APP_METHOD_RE } from '@/lib/ingest/patterns';

function matches(re: RegExp, src: string) {
  const out: RegExpExecArray[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m);
  return out;
}

describe('patterns', () => {
  it('finds Express routes', () => {
    const src = `app.get('/health', h);\nrouter.post("/api/login", h);`;
    const ms = matches(EXPRESS_ROUTE_RE, src);
    expect(ms.map((m) => [m[1].toUpperCase(), m[2]])).toEqual([
      ['GET', '/health'],
      ['POST', '/api/login'],
    ]);
  });

  it('finds env URL refs', () => {
    const src = `const x = process.env.PRODUCT_SERVICE_URL; const y = process.env.AUTH_ENDPOINT;`;
    expect(matches(ENV_URL_RE, src).map((m) => m[1])).toEqual([
      'PRODUCT_SERVICE_URL',
      'AUTH_ENDPOINT',
    ]);
  });

  it('parses .env.example lines', () => {
    const src = `# header\nPORT=4000\nAUTH_SERVICE_URL=http://localhost:4001\n`;
    expect(matches(ENV_LINE_RE, src).map((m) => [m[1], m[2]])).toEqual([
      ['PORT', '4000'],
      ['AUTH_SERVICE_URL', 'http://localhost:4001'],
    ]);
  });

  it('finds Next.js App Router methods', () => {
    const src = `export async function GET(req: Request) {}\nexport function POST() {}`;
    expect(matches(NEXT_APP_METHOD_RE, src).map((m) => m[1])).toEqual(['GET', 'POST']);
  });
});
