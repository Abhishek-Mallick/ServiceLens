// Datastore health checks: can we connect, authenticate, and get an answer?
//   postgres — `SELECT 1` through the `pg` driver
//   redis    — AUTH (if a password is set) + PING over the RESP protocol
//
// Both dial the IP returned by resolveAllowedHost (SSRF guard), keeping the
// original hostname for TLS SNI — which managed providers (Neon, Upstash, RDS
// proxies) use to route the connection.

import net from 'node:net';
import tls from 'node:tls';
import { Client } from 'pg';
import { resolveAllowedHost } from './net-guard';

export interface DatastoreResult {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
  details?: Record<string, unknown>;
}

function clean(err: unknown, password: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  return password ? msg.split(password).join('***') : msg;
}

export async function probePostgres(url: string, timeoutMs: number): Promise<DatastoreResult> {
  const start = Date.now();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, latencyMs: null, error: 'invalid connection string' };
  }
  const password = decodeURIComponent(u.password);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const database = decodeURIComponent(u.pathname.slice(1)) || 'postgres';
  const sslmode = (u.searchParams.get('sslmode') ?? 'prefer').toLowerCase();

  let ip: string;
  try {
    ip = await resolveAllowedHost(host);
  } catch (err) {
    return { ok: false, latencyMs: null, error: clean(err, password) };
  }

  const attempt = async (ssl: false | tls.ConnectionOptions): Promise<DatastoreResult> => {
    const client = new Client({
      host: ip,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username),
      password,
      database,
      ssl,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
      statement_timeout: timeoutMs,
      application_name: 'servicelens-probe',
    });
    client.on('error', () => {}); // late socket errors must not crash the process
    try {
      await client.connect();
      const q = Date.now();
      await client.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - start, details: { host, database, queryMs: Date.now() - q, tls: !!ssl } };
    } finally {
      client.end().catch(() => {});
    }
  };

  const sni = net.isIP(host) ? undefined : host;
  try {
    if (sslmode === 'disable') return await attempt(false);
    const verify = sslmode === 'verify-full' || sslmode === 'verify-ca';
    try {
      return await attempt({ rejectUnauthorized: verify, servername: sni });
    } catch (err) {
      // libpq's "prefer": fall back to plaintext only when the server has no TLS.
      if (sslmode === 'prefer' && /does not support SSL/i.test(String((err as Error).message))) return await attempt(false);
      throw err;
    }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: clean(err, password) };
  }
}

function resp(...args: string[]): string {
  return `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('');
}

export async function probeRedis(url: string, timeoutMs: number): Promise<DatastoreResult> {
  const start = Date.now();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, latencyMs: null, error: 'invalid Redis URL' };
  }
  const secure = u.protocol === 'rediss:';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const port = Number(u.port || 6379);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);

  let ip: string;
  try {
    ip = await resolveAllowedHost(host);
  } catch (err) {
    return { ok: false, latencyMs: null, error: clean(err, password) };
  }

  return new Promise((resolve) => {
    const sock: net.Socket = secure
      ? tls.connect({ host: ip, port, servername: net.isIP(host) ? undefined : host })
      : net.connect({ host: ip, port });
    let settled = false;
    let buf = '';
    let awaitingAuth = !!password;
    const done = (r: DatastoreResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, latencyMs: Date.now() - start, error: 'timeout' }), timeoutMs);

    sock.once(secure ? 'secureConnect' : 'connect', () => {
      const auth = password ? resp('AUTH', ...(user ? [user, password] : [password])) : '';
      sock.write(auth + resp('PING'));
    });
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (line.startsWith('-')) return done({ ok: false, latencyMs: Date.now() - start, error: `redis: ${clean(line.slice(1), password)}` });
        if (awaitingAuth) {
          awaitingAuth = false; // +OK
          continue;
        }
        if (line === '+PONG') return done({ ok: true, latencyMs: Date.now() - start, details: { host, tls: secure } });
      }
    });
    sock.on('error', (err) => done({ ok: false, latencyMs: Date.now() - start, error: clean(err, password) }));
  });
}
