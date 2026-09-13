// Local stand-ins for everything outside ServiceLens that the golden path
// touches, so the E2E suite never calls real GitHub, a real LLM or a real
// service. Started by playwright.config.ts as a webServer.
//
//   :57001  a monitored service   GET /health (200 or 503), /up, /down, /roster.csv
//   :57002  GitHub REST API + GitHub App endpoints (any acme/* repo, installed)
//           OpenAI-compatible LLM  POST /v1/chat/completions
//           test hooks             /admin/ping, /admin/log?repo=owner/name
//
// Every repo write is recorded so the test can assert exactly what ServiceLens
// would have done to a real repository.
const http = require('http');
const crypto = require('crypto');

// ── monitored service ─────────────────────────────────────────────────────
let healthy = true;
const ROSTER = ['service_name,oncall_name,oncall_email,escalation_email', '*,Acme SRE,sre@acme.test,lead@acme.test'].join('\n');

http
  .createServer((req, res) => {
    if (req.url === '/up') { healthy = true; return res.end('up'); }
    if (req.url === '/down') { healthy = false; return res.end('down'); }
    if (req.url === '/health') {
      res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ status: healthy ? 'ok' : 'failing' }));
    }
    if (req.url === '/roster.csv') { res.writeHead(200, { 'content-type': 'text/csv' }); return res.end(ROSTER); }
    res.writeHead(404);
    res.end();
  })
  .listen(57001, '127.0.0.1');

// ── GitHub + LLM ──────────────────────────────────────────────────────────
const blobSha = (s) => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0`).update(s).digest('hex');
const rid = (p) => p + crypto.randomBytes(8).toString('hex');

const FILES = {
  'package.json': JSON.stringify({ name: 'orders', dependencies: { express: '^4.19.0' } }, null, 2) + '\n',
  '.env.example': 'PORT=4000\nPAYMENTS_SERVICE_URL=http://localhost:4010\n',
  'src/app.js':
    "const express = require('express');\nconst { chargeOrder } = require('./clients/payments');\nconst app = express();\napp.use(express.json());\n\napp.get('/health', (req, res) => res.json({ status: 'ok' }));\napp.get('/api/orders', (req, res) => res.json([]));\n\napp.post('/orders', async (req, res) => {\n  try {\n    const receipt = await chargeOrder(req.body);\n    res.status(201).json({ ok: true, receipt });\n  } catch (err) {\n    res.status(502).json({ error: 'payment failed' });\n  }\n});\n\nmodule.exports = app;\n",
  'src/clients/payments.js':
    "const PAYMENTS_URL = process.env.PAYMENTS_SERVICE_URL || 'http://localhost:4010';\nconst TIMEOUT_MS = 500;\n\nasync function chargeOrder(order) {\n  const res = await fetch(`${PAYMENTS_URL}/charges`, {\n    method: 'POST',\n    headers: { 'content-type': 'application/json' },\n    body: JSON.stringify(order),\n    signal: AbortSignal.timeout(TIMEOUT_MS),\n  });\n  if (!res.ok) throw new Error(`payments ${res.status}`);\n  return res.json();\n}\n\nmodule.exports = { chargeOrder };\n",
};

const RCA = [
  '## Likely root cause',
  'Calls from orders to PAYMENTS_SERVICE_URL time out: TIMEOUT_MS is 500ms in src/clients/payments.js, while the payments p99 is about 1.8s under load.',
  '',
  '## Evidence',
  '- Health checks on /health flipped to down at the incident start.',
  '',
  '## Suggested next steps',
  '1. Raise the payments client timeout above the observed p99.',
].join('\n');

const repos = new Map(); // "owner/name" → state
function repo(full) {
  if (!repos.has(full)) repos.set(full, { head: { commit: rid('c'), tree: rid('t') }, refs: new Set(['refs/heads/main']), pulls: {}, writes: [], prNo: 0 });
  return repos.get(full);
}

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

function llm(body, res) {
  const user = (body.messages || []).filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  if (body.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const w of RCA.split(/(\s+)/)) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }
  const m = user.match(/### FILE: src\/clients\/payments\.js\n```\n([\s\S]*?)\n```/);
  if (m) {
    const fixed = m[1].replace('const TIMEOUT_MS = 500;', 'const TIMEOUT_MS = 3000; // payments p99 is ~1.8s under load');
    const out = {
      summary: 'Raise the payments client timeout above the payments p99.',
      prTitle: 'fix(orders): raise payments client timeout to 3s',
      prBody: '## Why\nCheckout calls time out at 500ms while payments p99 is ~1.8s.\n## What changed\n- TIMEOUT_MS 500 → 3000',
      files: [{ path: 'src/clients/payments.js', content: fixed }],
    };
    return json(res, 200, { choices: [{ message: { content: '```json\n' + JSON.stringify(out) + '\n```' } }] });
  }
  if (user.includes('### FILE:')) return json(res, 200, { choices: [{ message: { content: JSON.stringify({ noChange: true, reason: 'no relevant file' }) } }] });
  return json(res, 200, { choices: [{ message: { content: RCA } }] });
}

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname); // Octokit encodes '/' in refs
      const body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};

      if (p === '/admin/ping') return json(res, 200, { ok: true });
      if (p === '/admin/log') {
        const r = repos.get(url.searchParams.get('repo') || '');
        return json(res, 200, r ? { writes: r.writes, pulls: r.pulls, refs: [...r.refs] } : { writes: [], pulls: {}, refs: [] });
      }
      if (p === '/v1/chat/completions' || p === '/chat/completions') return llm(body, res);

      // GitHub App
      if (p === '/app') return json(res, 200, { id: 123, slug: 'servicelens-e2e' });
      if (/^\/app\/installations\/\d+\/access_tokens$/.test(p)) return json(res, 201, { token: 'ghs_e2e', expires_at: new Date(Date.now() + 3600e3).toISOString() });

      const m = p.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
      if (!m) return json(res, 404, { message: `fake: no route ${req.method} ${p}` });
      const [, owner, name, rest = ''] = m;
      if (owner !== 'acme') return json(res, 404, { message: 'Not Found' });
      const full = `${owner}/${name}`;
      const r = repo(full);

      if (rest === '/installation') return json(res, 200, { id: 42, account: { login: owner } });
      if (rest === '' && req.method === 'GET') return json(res, 200, { full_name: full, default_branch: 'main', private: true });
      if (rest === '/branches/main') return json(res, 200, { name: 'main', commit: { sha: r.head.commit } });
      if (rest.startsWith('/branches/')) return json(res, 404, { message: 'Branch not found' });
      if (rest.startsWith('/git/trees/') && req.method === 'GET') {
        return json(res, 200, { sha: r.head.tree, truncated: false, tree: Object.entries(FILES).map(([path, c]) => ({ path, mode: '100644', type: 'blob', sha: blobSha(c), size: Buffer.byteLength(c) })) });
      }
      if (rest.startsWith('/contents/')) {
        const path = rest.slice('/contents/'.length);
        const c = FILES[path];
        if (c === undefined) return json(res, 404, { message: 'Not Found' });
        return json(res, 200, { type: 'file', path, size: Buffer.byteLength(c), encoding: 'base64', content: Buffer.from(c).toString('base64'), sha: blobSha(c) });
      }
      if (rest === '/git/ref/heads/main') return json(res, 200, { ref: 'refs/heads/main', object: { sha: r.head.commit } });
      if (rest.startsWith('/git/commits/') && req.method === 'GET') return json(res, 200, { sha: rest.split('/').pop(), tree: { sha: r.head.tree } });

      if (req.method === 'POST') {
        r.writes.push({ path: rest, body: rest === '/git/blobs' ? { size: (body.content || '').length } : body });
        if (rest === '/git/blobs') return json(res, 201, { sha: blobSha(Buffer.from(body.content || '', 'base64').toString('utf8')) });
        if (rest === '/git/trees') return json(res, 201, { sha: rid('t') });
        if (rest === '/git/commits') return json(res, 201, { sha: rid('c') });
        if (rest === '/git/refs') {
          if (r.refs.has(body.ref)) return json(res, 422, { message: 'Reference already exists' });
          r.refs.add(body.ref);
          return json(res, 201, { ref: body.ref, object: { sha: body.sha } });
        }
        if (rest === '/pulls') {
          const n = ++r.prNo;
          r.pulls[n] = { number: n, html_url: `https://github.com/${full}/pull/${n}`, state: 'open', merged: false, draft: !!body.draft, head: { ref: body.head }, base: { ref: body.base }, title: body.title };
          return json(res, 201, r.pulls[n]);
        }
      }
      if (rest.startsWith('/pulls/')) {
        const n = Number(rest.split('/').pop());
        return r.pulls[n] ? json(res, 200, r.pulls[n]) : json(res, 404, { message: 'Not Found' });
      }
      json(res, 404, { message: `fake: no route ${req.method} ${p}` });
    });
  })
  .listen(57002, '127.0.0.1', () => console.log('[e2e fakes] service :57001, github+llm :57002'));
