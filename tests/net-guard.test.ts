import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { isPrivateAddress, guardedRequest, checkPublicUrl, validateProbeTarget } from '@/lib/net-guard';
import { runProbe } from '@/lib/probes';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
  ])('blocks %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (ip) => expect(isPrivateAddress(ip)).toBe(false)
  );
});

describe('guardedRequest against a local server', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: '/health' });
        res.end();
        return;
      }
      res.end('ok');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  afterEach(() => {
    delete process.env.ALLOW_PRIVATE_PROBES;
  });

  it('refuses an IP-literal private target', async () => {
    await expect(guardedRequest(`http://127.0.0.1:${port}/health`, { timeoutMs: 2000 })).rejects.toThrow(/blocked/);
  });

  it('refuses a hostname that resolves to a private address', async () => {
    await expect(guardedRequest(`http://localhost:${port}/health`, { timeoutMs: 2000 })).rejects.toThrow(/blocked/);
  });

  it('refuses cloud metadata', async () => {
    await expect(guardedRequest('http://169.254.169.254/latest/meta-data/', { timeoutMs: 1000 })).rejects.toThrow(/blocked/);
  });

  it('allows private targets when self-hosting opts in, and follows redirects', async () => {
    process.env.ALLOW_PRIVATE_PROBES = '1';
    const res = await guardedRequest(`http://127.0.0.1:${port}/redirect`, { timeoutMs: 2000 });
    expect(res.status).toBe(200);
    expect(res.body).toBe('ok');
    expect(res.finalUrl).toMatch(/\/health$/);
  });

  it('a blocked probe reports down with the reason instead of throwing', async () => {
    const r = await runProbe({
      id: 'p', serviceId: 's', name: 'n', type: 'http', target: 'http://169.254.169.254/', intervalSec: 60, timeoutSec: 1,
      expectStatus: null, expectBodyRegex: null, headers: null,
    });
    expect(r.status).toBe('down');
    expect(String(r.details.error)).toMatch(/blocked/);
  });

  it('blocks TCP probes to private hosts', async () => {
    const r = await runProbe({
      id: 'p', serviceId: 's', name: 'n', type: 'tcp', target: `127.0.0.1:${port}`, intervalSec: 60, timeoutSec: 1,
      expectStatus: null, expectBodyRegex: null, headers: null,
    });
    expect(r.status).toBe('down');
    expect(String(r.details.error)).toMatch(/blocked/);
  });
});

describe('validation-time checks', () => {
  it('rejects private and local deployed URLs', async () => {
    expect(await checkPublicUrl('http://10.0.0.5/health')).toMatch(/private/);
    expect(await checkPublicUrl('http://localhost:3000')).toMatch(/not publicly reachable/);
    expect(await checkPublicUrl('http://db.internal/health')).toMatch(/not publicly reachable/);
    expect(await checkPublicUrl('https://93.184.216.34/health')).toBeNull();
  });

  it('validates probe definitions', async () => {
    expect(await validateProbeTarget('http', 'ftp://x')).toMatch(/http\(s\)/);
    expect(await validateProbeTarget('tcp', 'db.example.com')).toMatch(/host:port/);
    expect(await validateProbeTarget('tcp', '10.0.0.1:5432')).toMatch(/private/);
    expect(await validateProbeTarget('cmd', 'rm -rf /')).toMatch(/unsupported/);
    expect(await validateProbeTarget('tcp', '93.184.216.34:443')).toBeNull();
  });
});
