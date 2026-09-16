import { describe, expect, it } from 'vitest';
import { parseCredentials } from '@/lib/workers-ai-keys';

describe('Workers AI credential configuration', () => {
  it('reads a single credential from WORKERS_AI_CREDENTIAL', () => {
    expect(parseCredentials({ WORKERS_AI_CREDENTIAL: 'acc1::tok1' })).toEqual([
      { accountId: 'acc1', token: 'tok1' },
    ]);
  });

  it('parses comma-separated WORKERS_AI_CREDENTIALS', () => {
    expect(parseCredentials({ WORKERS_AI_CREDENTIALS: 'acc1::tok1, acc2::tok2,,acc3::tok3 ' })).toEqual([
      { accountId: 'acc1', token: 'tok1' },
      { accountId: 'acc2', token: 'tok2' },
      { accountId: 'acc3', token: 'tok3' },
    ]);
  });

  it('ignores a blank WORKERS_AI_CREDENTIALS when WORKERS_AI_CREDENTIAL is set', () => {
    expect(parseCredentials({ WORKERS_AI_CREDENTIALS: '', WORKERS_AI_CREDENTIAL: 'acc1::tok1' })).toEqual([
      { accountId: 'acc1', token: 'tok1' },
    ]);
  });

  it('merges both variables and deduplicates identical accountId::token pairs', () => {
    expect(
      parseCredentials({ WORKERS_AI_CREDENTIALS: 'acc1::tok1,acc2::tok2', WORKERS_AI_CREDENTIAL: 'acc2::tok2' }),
    ).toEqual([
      { accountId: 'acc1', token: 'tok1' },
      { accountId: 'acc2', token: 'tok2' },
    ]);
  });

  it('returns empty when both are blank', () => {
    expect(parseCredentials({ WORKERS_AI_CREDENTIALS: ' ', WORKERS_AI_CREDENTIAL: '' })).toEqual([]);
  });

  it('skips entries without accountId::token separator', () => {
    expect(parseCredentials({ WORKERS_AI_CREDENTIALS: 'bad-entry,acc1::tok1' })).toEqual([
      { accountId: 'acc1', token: 'tok1' },
    ]);
  });
});
