import { describe, it, expect } from 'vitest';
import { buildTopologyFromContracts, type ContractService, type EdgeOverrideInput } from '@/lib/topology/from-contracts';

function svc(id: string, name: string, deps: string[] = []): ContractService {
  return {
    id, name, deployedUrl: null, healthStatus: 'unknown', framework: null, language: null, summary: null,
    outboundDeps: deps.map((envVar, i) => ({ envVar, file: 'src/clients.js', line: i + 1 })),
  };
}

const mesh = () => [
  svc('checkout', 'checkout', ['PAYMENT_URL', 'STRIPE_API_URL', 'LEDGER_HOST']),
  svc('pg', 'payment-gateway'),
  svc('ps', 'payment-service'),
  svc('books', 'bookkeeping'),
];

const deps = (overrides: EdgeOverrideInput[]) => buildTopologyFromContracts(mesh(), overrides);

describe('edge overrides', () => {
  it('without decisions: ambiguous + unresolved are reported, nothing invented', () => {
    const t = deps([]);
    expect(t.ambiguous.map((a) => a.envVar)).toEqual(['PAYMENT_URL']);
    expect(t.unresolved.map((u) => u.envVar).sort()).toEqual(['LEDGER_HOST', 'STRIPE_API_URL']);
    expect(t.dependencies).toHaveLength(0);
  });

  it('confirm picks one ambiguous candidate and persists it', () => {
    const t = deps([{ fromServiceId: 'checkout', toServiceId: 'ps', envVar: 'PAYMENT_URL', action: 'confirm' }]);
    expect(t.ambiguous).toHaveLength(0);
    expect(t.dependencies).toEqual([expect.objectContaining({ dependentId: 'checkout', dependencyId: 'ps', details: expect.objectContaining({ matchedBy: 'confirmed' }) })]);
  });

  it('rejecting one of two candidates resolves to the other', () => {
    const t = deps([{ fromServiceId: 'checkout', toServiceId: 'pg', envVar: 'PAYMENT_URL', action: 'reject' }]);
    expect(t.dependencies.map((d) => d.dependencyId)).toEqual(['ps']);
  });

  it('manual link resolves an env var no name matches', () => {
    const t = deps([{ fromServiceId: 'checkout', toServiceId: 'books', envVar: 'LEDGER_HOST', action: 'manual' }]);
    expect(t.unresolved.map((u) => u.envVar)).toEqual(['STRIPE_API_URL']);
    expect(t.dependencies).toEqual([expect.objectContaining({ dependencyId: 'books', details: expect.objectContaining({ matchedBy: 'manual', envVar: 'LEDGER_HOST' }) })]);
  });

  it('ignore marks an external dependency and stops flagging it', () => {
    const t = deps([{ fromServiceId: 'checkout', toServiceId: null, envVar: 'STRIPE_API_URL', action: 'ignore' }]);
    expect(t.unresolved.map((u) => u.envVar)).toEqual(['LEDGER_HOST']);
    expect(t.ignored).toEqual([{ serviceId: 'checkout', envVar: 'STRIPE_API_URL' }]);
  });

  it('free-standing manual edges are added once and never self-loop', () => {
    const t = deps([
      { fromServiceId: 'books', toServiceId: 'ps', envVar: '', action: 'manual' },
      { fromServiceId: 'books', toServiceId: 'ps', envVar: '', action: 'manual' },
      { fromServiceId: 'books', toServiceId: 'books', envVar: '', action: 'manual' },
    ]);
    expect(t.dependencies.filter((d) => d.dependentId === 'books')).toHaveLength(1);
  });

  it('decisions about deleted services are ignored', () => {
    const t = deps([{ fromServiceId: 'checkout', toServiceId: 'gone', envVar: 'LEDGER_HOST', action: 'manual' }]);
    expect(t.unresolved.map((u) => u.envVar)).toContain('LEDGER_HOST');
  });
});
