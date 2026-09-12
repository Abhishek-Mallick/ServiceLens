import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ingestFromFiles } from '@/lib/ingest/ingest-service';
import { buildTopologyFromContracts, envStemTokens, type ContractService } from '@/lib/topology/from-contracts';

function loadFixture(repo: string) {
  const root = path.resolve(__dirname, 'fixtures/repos', repo);
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

function svc(id: string, name: string, extra: Partial<ContractService> = {}): ContractService {
  return { id, name, deployedUrl: null, healthStatus: 'unknown', framework: null, language: null, summary: null, outboundDeps: [], ...extra };
}

describe('envStemTokens', () => {
  it('strips URL-ish suffixes and generic tokens', () => {
    expect(envStemTokens('PRODUCT_SERVICE_URL')).toEqual(['product']);
    expect(envStemTokens('PAYMENTS_API_BASE_URL')).toEqual(['payments']);
    expect(envStemTokens('INVENTORY_HOST')).toEqual(['inventory']);
  });
});

describe('buildTopologyFromContracts', () => {
  it('derives gateway → product edge from the real fixture repos', () => {
    const gateway = ingestFromFiles(loadFixture('ecommerce-gateway'));
    const product = ingestFromFiles(loadFixture('ecommerce-product-service'));
    const services = [
      svc('gw', 'ecommerce-gateway', { outboundDeps: gateway.outboundDeps }),
      svc('prod', 'ecommerce-product-service', { outboundDeps: product.outboundDeps }),
    ];
    const topo = buildTopologyFromContracts(services);

    expect(topo.dependencies).toEqual([
      expect.objectContaining({ dependentId: 'gw', dependencyId: 'prod', type: 'rest' }),
    ]);
    // Auth/user/cart/order aren't onboarded in this test → unresolved, not invented.
    const unresolved = topo.unresolved.filter((u) => u.serviceId === 'gw').map((u) => u.envVar);
    expect(unresolved).toEqual(expect.arrayContaining(['AUTH_SERVICE_URL', 'CART_SERVICE_URL']));
    expect(topo.graph.nodes).toHaveLength(2);
  });

  it('dedupes an env var referenced from several files', () => {
    const services = [
      svc('a', 'gateway', {
        outboundDeps: [
          { envVar: 'ORDER_SERVICE_URL', file: 'a.js', line: 1 },
          { envVar: 'ORDER_SERVICE_URL', file: 'b.js', line: 9 },
        ],
      }),
      svc('b', 'order-service'),
    ];
    const topo = buildTopologyFromContracts(services);
    expect(topo.dependencies).toHaveLength(1);
    expect(topo.graph.edges).toHaveLength(1);
  });

  it('prefers deployed-host match over name match', () => {
    const services = [
      svc('a', 'web', { outboundDeps: [{ envVar: 'BACKEND_URL', urlExample: 'https://core.example.com', file: 'x', line: 1 }] }),
      svc('b', 'core-api', { deployedUrl: 'https://core.example.com' }),
      svc('c', 'backend-legacy'),
    ];
    const topo = buildTopologyFromContracts(services);
    expect(topo.dependencies.map((d) => d.dependencyId)).toEqual(['b']);
  });

  it('marks multi-candidate matches ambiguous and does not persist them', () => {
    const services = [
      svc('a', 'checkout', { outboundDeps: [{ envVar: 'PAYMENT_URL', file: 'x', line: 1 }] }),
      svc('b', 'payment-gateway'),
      svc('c', 'payment-service'),
    ];
    const topo = buildTopologyFromContracts(services);
    expect(topo.dependencies).toHaveLength(0);
    expect(topo.ambiguous).toEqual([{ serviceId: 'a', envVar: 'PAYMENT_URL', candidateIds: ['b', 'c'] }]);
    expect(topo.graph.edges.every((e) => e.details?.ambiguous === true)).toBe(true);
  });

  it('never links a service to itself', () => {
    const services = [svc('a', 'order-service', { outboundDeps: [{ envVar: 'ORDER_SERVICE_URL', file: 'x', line: 1 }] })];
    expect(buildTopologyFromContracts(services).dependencies).toHaveLength(0);
  });
});
