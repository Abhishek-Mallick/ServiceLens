// SSRF protection for every outbound request whose destination a user controls
// (probe targets, deployed URLs, webhook URLs).
//
// The check lives in the DNS `lookup` hook that Node's http/https/net use to
// connect, so it runs on the address actually dialled — covering DNS rebinding
// and redirects, not just the hostname a user typed.
//
// Self-hosters who need to monitor internal services set ALLOW_PRIVATE_PROBES=1.

import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

export function privateNetworksAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_PROBES === '1' || process.env.ALLOW_PRIVATE_PROBES === 'true';
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

function inV4Block(ip: string, [base, bits]: [string, number]): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return V4_BLOCKS.some((b) => inV4Block(ip, b));
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (v === '::' || v === '::1') return true;
    if (/^f[cd]/.test(v)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(v)) return true; // link-local fe80::/10
    if (/^ff/.test(v)) return true; // multicast
    return false;
  }
  return true; // not an IP at all — refuse rather than guess
}

export class BlockedAddressError extends Error {
  constructor(host: string, address: string) {
    super(`blocked: ${host} resolves to a private or reserved address (${address}). Set ALLOW_PRIVATE_PROBES=1 when self-hosting to monitor internal services.`);
    this.name = 'BlockedAddressError';
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

// Drop-in replacement for dns.lookup that refuses private destinations.
export function guardedLookup(hostname: string, options: dns.LookupOptions | number | LookupCallback, callback?: LookupCallback): void {
  const cb = (typeof options === 'function' ? options : callback) as LookupCallback;
  const opts: dns.LookupOptions = typeof options === 'object' && options ? options : {};
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 0);
    const list = addresses as dns.LookupAddress[];
    if (!privateNetworksAllowed()) {
      const bad = list.find((a) => isPrivateAddress(a.address));
      if (bad) return cb(new BlockedAddressError(hostname, bad.address) as NodeJS.ErrnoException, '', 0);
    }
    if (opts.all) return cb(null, list);
    const first = list[0];
    cb(null, first.address, first.family);
  });
}

// Node skips `lookup` when the host is already an IP literal, so literals are
// checked explicitly before connecting.
export function assertAllowedHost(host: string): void {
  const h = host.replace(/^\[|\]$/g, '');
  if (!privateNetworksAllowed() && net.isIP(h) && isPrivateAddress(h)) throw new BlockedAddressError(h, h);
}

// Resolve a hostname to the single address we will dial, refusing private
// ranges. Callers connect to the returned IP (not the name), so a DNS answer
// can't change between the check and the connection.
export async function resolveAllowedHost(host: string): Promise<string> {
  const h = host.replace(/^\[|\]$/g, '');
  if (net.isIP(h)) {
    assertAllowedHost(h);
    return h;
  }
  const addrs = await dns.promises.lookup(h, { all: true });
  if (addrs.length === 0) throw new Error(`cannot resolve ${h}`);
  if (!privateNetworksAllowed()) {
    const bad = addrs.find((a) => isPrivateAddress(a.address));
    if (bad) throw new BlockedAddressError(h, bad.address);
  }
  return addrs[0].address;
}

// Validation-time check (onboarding forms). Unresolvable hosts pass — the
// service may not be deployed yet; the connect-time guard still applies.
export async function checkPublicUrl(raw: string): Promise<string | null> {
  if (privateNetworksAllowed()) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'invalid URL';
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return isPrivateAddress(host) ? `${host} is a private or reserved address` : null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return `${host} is not publicly reachable`;
  }
  try {
    const addrs = await dns.promises.lookup(host, { all: true });
    const bad = addrs.find((a) => isPrivateAddress(a.address));
    return bad ? `${host} resolves to a private address (${bad.address})` : null;
  } catch {
    return null;
  }
}

export interface GuardedResponse {
  status: number;
  body: string;
  finalUrl: string;
}

// Minimal GET/POST over http(s) with the guarded lookup, a hard timeout, a body
// cap, and manual redirects (each hop re-checked by the lookup hook).
export function guardedRequest(
  rawUrl: string,
  opts: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs: number; maxBodyBytes?: number; maxRedirects?: number }
): Promise<GuardedResponse> {
  const maxBody = opts.maxBodyBytes ?? 64 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;

  const attempt = (current: string, hopsLeft: number, deadline: number): Promise<GuardedResponse> =>
    new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(current);
      } catch {
        return reject(new Error(`invalid URL: ${current}`));
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject(new Error(`unsupported protocol ${url.protocol}`));
      try {
        assertAllowedHost(url.hostname);
      } catch (err) {
        return reject(err);
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return reject(new Error('timeout'));

      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(
        url,
        {
          method: opts.method ?? 'GET',
          headers: { 'user-agent': 'ServiceLens-Probe/1.0', ...(opts.headers ?? {}) },
          lookup: guardedLookup as unknown as net.LookupFunction,
          timeout: remaining,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location && hopsLeft > 0 && (opts.method ?? 'GET') === 'GET') {
            res.resume();
            const next = new URL(res.headers.location, url).toString();
            return resolve(attempt(next, hopsLeft - 1, deadline));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            if (size >= maxBody) return;
            size += c.length;
            chunks.push(c);
          });
          res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8').slice(0, maxBody), finalUrl: url.toString() }));
          res.on('error', reject);
        }
      );
      // `timeout` above is an idle timeout; this enforces the total deadline
      // so a slow-drip response can't hold a probe open.
      const hard = setTimeout(() => req.destroy(new Error('timeout')), remaining);
      req.on('close', () => clearTimeout(hard));
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      if (opts.body) req.write(opts.body);
      req.end();
    });

  return attempt(rawUrl, maxRedirects, Date.now() + opts.timeoutMs);
}

// Validate a probe definition before saving it. Returns an error message or null.
export async function validateProbeTarget(type: string, target: string): Promise<string | null> {
  if (type === 'http') {
    if (!/^https?:\/\//i.test(target)) return 'HTTP probe target must be an http(s):// URL';
    return checkPublicUrl(target);
  }
  if (type === 'tcp') {
    const idx = target.lastIndexOf(':');
    const port = Number(target.slice(idx + 1));
    if (idx <= 0 || !Number.isInteger(port) || port <= 0 || port > 65535) return 'TCP probe target must be host:port';
    const host = target.slice(0, idx).replace(/^\[|\]$/g, '');
    return checkPublicUrl(`tcp://${net.isIPv6(host) ? `[${host}]` : host}:${port}`);
  }
  if (type === 'postgres' || type === 'redis') {
    const scheme = type === 'postgres' ? /^postgres(ql)?:\/\//i : /^rediss?:\/\//i;
    if (!scheme.test(target)) {
      return type === 'postgres'
        ? 'Postgres target must be a postgres://user:password@host:5432/db connection string'
        : 'Redis target must be a redis:// or rediss:// URL';
    }
    try {
      if (!new URL(target).hostname) return 'connection string has no host';
    } catch {
      return 'invalid connection string';
    }
    return checkPublicUrl(target);
  }
  return `unsupported probe type "${type}"`;
}
