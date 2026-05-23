import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractDeps, parseEnvExample } from '@/lib/ingest/extract-deps';

const FIX = path.resolve(__dirname, '../fixtures/repos/ecommerce-gateway');
function read(rel: string) { return { path: rel, content: fs.readFileSync(path.join(FIX, rel), 'utf8') }; }

describe('extractDeps', () => {
  it('finds env URL references in source', () => {
    const deps = extractDeps([read('src/clients/serviceUrls.js')], {});
    const names = deps.map((d) => d.envVar).sort();
    expect(names).toEqual(['AUTH_SERVICE_URL', 'CART_SERVICE_URL', 'ORDER_SERVICE_URL', 'PRODUCT_SERVICE_URL', 'USER_SERVICE_URL']);
  });

  it('attaches urlExample from .env.example map', () => {
    const env = parseEnvExample(read('.env.example').content);
    expect(env.AUTH_SERVICE_URL).toBe('http://localhost:4001');

    const deps = extractDeps([read('src/clients/serviceUrls.js')], env);
    const auth = deps.find((d) => d.envVar === 'AUTH_SERVICE_URL')!;
    expect(auth.urlExample).toBe('http://localhost:4001');
  });

  it('dedupes by envVar across files (first occurrence wins)', () => {
    const files = [
      { path: 'a.js', content: 'process.env.FOO_URL' },
      { path: 'b.js', content: 'process.env.FOO_URL' },
    ];
    const deps = extractDeps(files, {});
    expect(deps).toHaveLength(1);
    expect(deps[0].file).toBe('a.js');
  });
});

describe('parseEnvExample', () => {
  it('parses KEY=val lines, ignoring comments', () => {
    const env = parseEnvExample(`# header\nPORT=4000\nFOO=bar=baz\n`);
    expect(env).toEqual({ PORT: '4000', FOO: 'bar=baz' });
  });
});
