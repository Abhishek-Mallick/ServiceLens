import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { probePostgres, probeRedis } from '@/lib/datastore-probes';

// Minimal RESP server: optional password, answers AUTH and PING.
function fakeRedis(password: string | null) {
  return net.createServer((sock) => {
    let authed = !password;
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      // Parse complete RESP arrays: *N\r\n($len\r\nval\r\n){N}
      for (;;) {
        const m = buf.match(/^\*(\d+)\r\n/);
        if (!m) return;
        let rest = buf.slice(m[0].length);
        const args: string[] = [];
        for (let i = 0; i < Number(m[1]); i++) {
          const lm = rest.match(/^\$(\d+)\r\n/);
          if (!lm) return;
          const len = Number(lm[1]);
          const start = lm[0].length;
          if (rest.length < start + len + 2) return;
          args.push(rest.slice(start, start + len));
          rest = rest.slice(start + len + 2);
        }
        buf = rest;
        const cmd = args[0].toUpperCase();
        if (cmd === 'AUTH') {
          if (args[args.length - 1] === password) { authed = true; sock.write('+OK\r\n'); } else sock.write('-WRONGPASS invalid username-password pair\r\n');
        } else if (cmd === 'PING') {
          sock.write(authed ? '+PONG\r\n' : '-NOAUTH Authentication required.\r\n');
        }
      }
    });
  });
}

describe('redis probe', () => {
  let open: net.Server;
  let locked: net.Server;
  let openPort: number;
  let lockedPort: number;
  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_PROBES = '1';
    open = fakeRedis(null);
    locked = fakeRedis('s3cret');
    await new Promise<void>((r) => open.listen(0, '127.0.0.1', r));
    await new Promise<void>((r) => locked.listen(0, '127.0.0.1', r));
    openPort = (open.address() as AddressInfo).port;
    lockedPort = (locked.address() as AddressInfo).port;
  });
  afterAll(async () => {
    delete process.env.ALLOW_PRIVATE_PROBES;
    await new Promise<void>((r) => open.close(() => r()));
    await new Promise<void>((r) => locked.close(() => r()));
  });

  it('PONG from an open server is healthy', async () => {
    const r = await probeRedis(`redis://127.0.0.1:${openPort}`, 2000);
    expect(r.ok).toBe(true);
    expect(r.latencyMs).not.toBeNull();
  });

  it('authenticates with the password from the URL', async () => {
    expect((await probeRedis(`redis://:s3cret@127.0.0.1:${lockedPort}`, 2000)).ok).toBe(true);
    expect((await probeRedis(`redis://default:s3cret@127.0.0.1:${lockedPort}`, 2000)).ok).toBe(true);
  });

  it('reports a wrong password without echoing it', async () => {
    const r = await probeRedis(`redis://:nope-guess@127.0.0.1:${lockedPort}`, 2000);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/WRONGPASS/);
    expect(r.error).not.toContain('nope-guess');
  });

  it('reports a missing password', async () => {
    const r = await probeRedis(`redis://127.0.0.1:${lockedPort}`, 2000);
    expect(r.error).toMatch(/NOAUTH/);
  });
});

describe('SSRF guard applies to datastores', () => {
  afterEach(() => {
    delete process.env.ALLOW_PRIVATE_PROBES;
  });

  it('refuses private hosts by default', async () => {
    const pg = await probePostgres('postgres://u:pw@127.0.0.1:5432/db', 1000);
    expect(pg.ok).toBe(false);
    expect(pg.error).toMatch(/blocked/);
    const redis = await probeRedis('redis://10.0.0.5:6379', 1000);
    expect(redis.error).toMatch(/blocked/);
  });

  it('never leaks the password in Postgres errors', async () => {
    process.env.ALLOW_PRIVATE_PROBES = '1';
    const r = await probePostgres('postgres://u:very-secret-pw@127.0.0.1:1/db?sslmode=disable', 1500);
    expect(r.ok).toBe(false);
    expect(r.error).not.toContain('very-secret-pw');
  });
});
