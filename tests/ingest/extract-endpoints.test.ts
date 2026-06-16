import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractEndpoints } from '@/lib/ingest/extract-endpoints';

const FIX = path.resolve(__dirname, '../fixtures/repos/ecommerce-gateway');
function read(rel: string) {
  return { path: rel, content: fs.readFileSync(path.join(FIX, rel), 'utf8') };
}

describe('extractEndpoints', () => {
  it('extracts routes from src/app.js (Express)', () => {
    const eps = extractEndpoints([read('src/app.js')]);
    expect(eps.some((e) => e.method === 'GET' && e.path === '/health')).toBe(true);
    expect(eps.some((e) => e.method === 'POST' && e.path === '/api/auth/register')).toBe(true);
  });

  it('records file + line for each endpoint', () => {
    const eps = extractEndpoints([read('src/app.js')]);
    const health = eps.find((e) => e.path === '/health')!;
    expect(health.file).toBe('src/app.js');
    expect(health.line).toBeGreaterThan(0);
  });

  it('handles Next.js App Router route.ts files', () => {
    const file = {
      path: 'app/api/users/[id]/route.ts',
      content: `export async function GET(req: Request) {}\nexport async function DELETE(req: Request) {}`,
    };
    const eps = extractEndpoints([file]);
    expect(eps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/users/:id' }),
        expect.objectContaining({ method: 'DELETE', path: '/api/users/:id' }),
      ]),
    );
  });

  it('returns empty for unrelated files', () => {
    const eps = extractEndpoints([{ path: 'README.md', content: 'hello' }]);
    expect(eps).toEqual([]);
  });
});
