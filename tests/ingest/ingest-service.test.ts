import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ingestFromFiles } from '@/lib/ingest/ingest-service';

function loadFixture(repo: string) {
  const root = path.resolve(__dirname, '../fixtures/repos', repo);
  const walk = (dir: string, base = ''): { path: string; content: string }[] => {
    const out: { path: string; content: string }[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...walk(full, rel));
      else out.push({ path: rel, content: fs.readFileSync(full, 'utf8') });
    }
    return out;
  };
  return walk(root);
}

describe('ingestFromFiles (orchestrator)', () => {
  it('builds a contract for ecommerce-gateway', () => {
    const contract = ingestFromFiles(loadFixture('ecommerce-gateway'));
    expect(contract.framework).toBe('express');
    expect(contract.endpoints.some((e) => e.path === '/health')).toBe(true);
    expect(contract.endpoints.length).toBeGreaterThan(5);

    const envs = contract.outboundDeps.map((d) => d.envVar).sort();
    expect(envs).toEqual(
      expect.arrayContaining(['AUTH_SERVICE_URL', 'PRODUCT_SERVICE_URL', 'USER_SERVICE_URL']),
    );

    const auth = contract.outboundDeps.find((d) => d.envVar === 'AUTH_SERVICE_URL')!;
    expect(auth.urlExample).toBe('http://localhost:4001');

    expect(contract.envVars.some((e) => e.name === 'AUTH_SERVICE_URL')).toBe(true);
  });

  it('builds a contract for ecommerce-product-service', () => {
    const contract = ingestFromFiles(loadFixture('ecommerce-product-service'));
    expect(contract.framework).toBe('express');
    expect(contract.endpoints.some((e) => e.path === '/health')).toBe(true);
  });
});
