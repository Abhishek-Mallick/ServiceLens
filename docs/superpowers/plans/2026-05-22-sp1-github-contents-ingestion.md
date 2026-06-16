# SP1 — Real GitHub Ingestion via Contents API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `simple-git clone` + heuristic-keyfile pipeline with a GitHub Contents API ingester that extracts a typed `ServiceContract` (endpoints + outbound deps + env vars + framework) from a real repo, persisted as a new Prisma row.

**Architecture:** Octokit calls `git/trees/{sha}?recursive=1` to enumerate paths, then `repos/{owner}/{repo}/contents/{path}` (or the raw blob endpoint) to read individual files filtered by extension + size cap. Two regex-based extractors (`extract-endpoints`, `extract-deps`) walk the source content. An orchestrator (`ingest-service`) persists the result as a `ServiceContract` row. v1 uses unauthenticated REST (60 req/hr/IP per public repo) — GitHub App auth ships in SP5.

**Tech Stack:** `@octokit/rest`, Prisma 5, Vitest, Next.js Route Handlers, zod.

---

## File Structure

**New files:**
- `lib/ingest/patterns.ts` — single source of truth for endpoint + dep regexes.
- `lib/ingest/extract-endpoints.ts` — pure function: `(file) => Endpoint[]`.
- `lib/ingest/extract-deps.ts` — pure function: `(file) => OutboundDep[]`.
- `lib/ingest/github-client.ts` — thin Octokit wrapper, unauthenticated for v1.
- `lib/ingest/github-contents.ts` — `listTree(repo)`, `readFile(repo, path)` with size cap + paging.
- `lib/ingest/ingest-service.ts` — orchestrator: tree → filter → extract → assemble `ServiceContract`.
- `lib/ingest/types.ts` — `Endpoint`, `OutboundDep`, `ServiceContract` TS types (mirrors Prisma JSON shape).
- `tests/ingest/patterns.test.ts`
- `tests/ingest/extract-endpoints.test.ts`
- `tests/ingest/extract-deps.test.ts`
- `tests/ingest/ingest-service.test.ts` — uses local fixtures, no network.
- `tests/fixtures/repos/ecommerce-gateway/` — committed source snapshots (just the files extractors need).
- `tests/fixtures/repos/ecommerce-product-service/` — same.

**Modified files:**
- `prisma/schema.prisma` — add `Service.provider`, `Service.deployedUrl`, model `ServiceContract`.
- `app/api/architectures/[id]/services/route.ts` — accept `deployedUrl`, `provider` in POST body.
- `app/api/architectures/[id]/analyze/route.ts` — call new ingest pipeline instead of `cloneShallow`+`extractKeyFiles`+`heuristicAnalyze`.

**Untouched (deferred to later SPs):** topology builder, probes, incidents, notify, UI.

---

### Task 1: Prisma schema — add provider, deployedUrl, ServiceContract

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add columns + new model**

Insert into `model Service { ... }` (next to existing `repoUrl`):

```prisma
  provider        String   @default("github") // "github" | "bitbucket_soon" | "gitlab_soon"
  deployedUrl     String?
  contract        ServiceContract?
```

Append at end of file:

```prisma
model ServiceContract {
  id          String   @id @default(cuid())
  serviceId   String   @unique
  service     Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  endpoints   String   // JSON: Endpoint[]
  outboundDeps String  // JSON: OutboundDep[]
  envVars     String   // JSON: { name, defaultValue? }[]
  framework   String?
  commitSha   String?
  extractedAt DateTime @default(now())
}
```

- [ ] **Step 2: Push schema + regenerate client**

Run: `npm run prisma:push && npm run prisma:generate`
Expected: prisma reports new column + table, no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add Service.deployedUrl, provider + ServiceContract"
```

---

### Task 2: Test fixtures — snapshot real ecommerce repos

**Files:**
- Create: `tests/fixtures/repos/ecommerce-gateway/package.json`
- Create: `tests/fixtures/repos/ecommerce-gateway/.env.example`
- Create: `tests/fixtures/repos/ecommerce-gateway/src/app.js`
- Create: `tests/fixtures/repos/ecommerce-gateway/src/clients/serviceUrls.js`
- Create: `tests/fixtures/repos/ecommerce-gateway/src/routes/authRoutes.js`
- Create: `tests/fixtures/repos/ecommerce-gateway/src/routes/productRoutes.js`
- Create: `tests/fixtures/repos/ecommerce-product-service/package.json`
- Create: `tests/fixtures/repos/ecommerce-product-service/.env.example`
- Create: `tests/fixtures/repos/ecommerce-product-service/src/app.js`
- Create: `tests/fixtures/repos/ecommerce-product-service/src/routes/productRoutes.js`

- [ ] **Step 1: Fetch real file contents and commit them**

For each path above, run:

```bash
mkdir -p tests/fixtures/repos/ecommerce-gateway/src/{clients,routes}
mkdir -p tests/fixtures/repos/ecommerce-product-service/src/routes
```

Then for each file, fetch from raw.githubusercontent.com and write locally. Example:

```bash
curl -sSL https://raw.githubusercontent.com/buildlab-devs/ecommerce-gateway/main/src/app.js \
  -o tests/fixtures/repos/ecommerce-gateway/src/app.js
```

(Use `curl -sSL` for each fixture file. Use real content — do not stub.)

- [ ] **Step 2: Verify each fixture is non-empty**

Run: `find tests/fixtures/repos -type f -size 0` — expect no output.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/repos
git commit -m "test(fixtures): snapshot ecommerce-gateway + product-service for ingest tests"
```

---

### Task 3: `lib/ingest/types.ts` + `lib/ingest/patterns.ts`

**Files:**
- Create: `lib/ingest/types.ts`
- Create: `lib/ingest/patterns.ts`
- Create: `tests/ingest/patterns.test.ts`

- [ ] **Step 1: Write `lib/ingest/types.ts`**

```ts
export interface Endpoint {
  method: string;       // GET | POST | PUT | PATCH | DELETE | ANY
  path: string;         // express-style "/api/auth/login" — Next [seg] normalized to :seg
  file: string;
  line: number;
  handlerName?: string;
}

export interface OutboundDep {
  envVar: string;        // PRODUCT_SERVICE_URL
  urlExample?: string;   // http://localhost:4003 (from .env.example)
  file: string;
  line: number;
}

export interface EnvVar {
  name: string;
  defaultValue?: string;
}

export interface ServiceContract {
  endpoints: Endpoint[];
  outboundDeps: OutboundDep[];
  envVars: EnvVar[];
  framework: 'express' | 'nextjs-app' | 'nextjs-pages' | 'fastify' | 'unknown';
  commitSha?: string;
}
```

- [ ] **Step 2: Write `lib/ingest/patterns.ts`**

```ts
// Express / Fastify / Koa-style: app.method('/path', ...) or router.method('/path', ...)
export const EXPRESS_ROUTE_RE =
  /\b(?:app|router|api|server)\.(get|post|put|patch|delete|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

// process.env.SOMETHING_URL / _ENDPOINT / _HOST
export const ENV_URL_RE = /process\.env\.([A-Z][A-Z0-9_]*_(?:URL|ENDPOINT|HOST))\b/g;

// `.env.example` line: NAME=value (anchored to start of line)
export const ENV_LINE_RE = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/gm;

// Next.js App Router method export
export const NEXT_APP_METHOD_RE =
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
```

- [ ] **Step 3: Write `tests/ingest/patterns.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { EXPRESS_ROUTE_RE, ENV_URL_RE, ENV_LINE_RE, NEXT_APP_METHOD_RE } from '@/lib/ingest/patterns';

function matches(re: RegExp, src: string) {
  const out: RegExpExecArray[] = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m);
  return out;
}

describe('patterns', () => {
  it('finds Express routes', () => {
    const src = `app.get('/health', h);\nrouter.post("/api/login", h);`;
    const ms = matches(EXPRESS_ROUTE_RE, src);
    expect(ms.map((m) => [m[1].toUpperCase(), m[2]])).toEqual([
      ['GET', '/health'],
      ['POST', '/api/login'],
    ]);
  });

  it('finds env URL refs', () => {
    const src = `const x = process.env.PRODUCT_SERVICE_URL; const y = process.env.AUTH_ENDPOINT;`;
    expect(matches(ENV_URL_RE, src).map((m) => m[1])).toEqual([
      'PRODUCT_SERVICE_URL',
      'AUTH_ENDPOINT',
    ]);
  });

  it('parses .env.example lines', () => {
    const src = `PORT=4000\nAUTH_SERVICE_URL=http://localhost:4001\n# comment`;
    expect(matches(ENV_LINE_RE, src).map((m) => [m[1], m[2]])).toEqual([
      ['PORT', '4000'],
      ['AUTH_SERVICE_URL', 'http://localhost:4001'],
    ]);
  });

  it('finds Next.js App Router methods', () => {
    const src = `export async function GET(req: Request) {}\nexport function POST() {}`;
    expect(matches(NEXT_APP_METHOD_RE, src).map((m) => m[1])).toEqual(['GET', 'POST']);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ingest/patterns.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/types.ts lib/ingest/patterns.ts tests/ingest/patterns.test.ts
git commit -m "feat(ingest): regex patterns + types for endpoints/deps"
```

---

### Task 4: `lib/ingest/extract-endpoints.ts`

**Files:**
- Create: `lib/ingest/extract-endpoints.ts`
- Create: `tests/ingest/extract-endpoints.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractEndpoints } from '@/lib/ingest/extract-endpoints';

const FIX = path.resolve(__dirname, '../fixtures/repos/ecommerce-gateway');
function read(rel: string) {
  return { path: rel, content: fs.readFileSync(path.join(FIX, rel), 'utf8') };
}

describe('extractEndpoints', () => {
  it('extracts routes from src/app.js (Express)', () => {
    const eps = extractEndpoints([read('src/app.js')]);
    expect(eps.some((e) => e.method === 'GET' && e.path === '/health')).toBe(true);
    expect(eps.some((e) => e.method === 'POST' && e.path === '/api/auth/register')).toBe(true);
  });

  it('records file + line for each endpoint', () => {
    const eps = extractEndpoints([read('src/app.js')]);
    const health = eps.find((e) => e.path === '/health')!;
    expect(health.file).toBe('src/app.js');
    expect(health.line).toBeGreaterThan(0);
  });

  it('handles Next.js App Router route.ts files', () => {
    const file = {
      path: 'app/api/users/[id]/route.ts',
      content: `export async function GET(req: Request) {}\nexport async function DELETE(req: Request) {}`,
    };
    const eps = extractEndpoints([file]);
    expect(eps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/users/:id' }),
        expect.objectContaining({ method: 'DELETE', path: '/api/users/:id' }),
      ]),
    );
  });

  it('returns empty for unrelated files', () => {
    const eps = extractEndpoints([{ path: 'README.md', content: 'hello' }]);
    expect(eps).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

Run: `npx vitest run tests/ingest/extract-endpoints.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/ingest/extract-endpoints.ts
import { EXPRESS_ROUTE_RE, NEXT_APP_METHOD_RE } from './patterns';
import type { Endpoint } from './types';

interface SourceFile { path: string; content: string }

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

// app/api/users/[id]/route.ts  =>  /api/users/:id
function nextAppPathFromFile(filePath: string): string | null {
  const m = filePath.match(/^app\/(.+)\/route\.(?:ts|js|tsx|jsx)$/);
  if (!m) return null;
  const segments = m[1].split('/').filter(Boolean);
  // Drop route groups like (auth)
  const clean = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  return '/' + clean.map((s) => s.replace(/^\[\.{3}?(.+)\]$/, ':$1')).join('/');
}

// pages/api/users/[id].ts  =>  /api/users/:id
function nextPagesPathFromFile(filePath: string): string | null {
  const m = filePath.match(/^pages\/api\/(.+)\.(?:ts|js|tsx|jsx)$/);
  if (!m) return null;
  let rel = m[1].replace(/\/index$/, '');
  rel = rel.replace(/\[\.{3}?(.+?)\]/g, ':$1');
  return '/api/' + rel;
}

export function extractEndpoints(files: SourceFile[]): Endpoint[] {
  const out: Endpoint[] = [];

  for (const f of files) {
    // Express / Fastify / Koa
    EXPRESS_ROUTE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXPRESS_ROUTE_RE.exec(f.content)) !== null) {
      const method = m[1].toUpperCase();
      if (method === 'USE') continue; // middleware, not an endpoint
      out.push({
        method: method === 'ALL' ? 'ANY' : method,
        path: m[2],
        file: f.path,
        line: lineOf(f.content, m.index),
      });
    }

    // Next.js App Router
    const appPath = nextAppPathFromFile(f.path);
    if (appPath) {
      NEXT_APP_METHOD_RE.lastIndex = 0;
      while ((m = NEXT_APP_METHOD_RE.exec(f.content)) !== null) {
        out.push({
          method: m[1],
          path: appPath,
          file: f.path,
          line: lineOf(f.content, m.index),
        });
      }
    }

    // Next.js Pages Router — any export default = ANY method
    const pagesPath = nextPagesPathFromFile(f.path);
    if (pagesPath && /export\s+default\s+/.test(f.content)) {
      out.push({
        method: 'ANY',
        path: pagesPath,
        file: f.path,
        line: 1,
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ingest/extract-endpoints.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/extract-endpoints.ts tests/ingest/extract-endpoints.test.ts
git commit -m "feat(ingest): extract Express + Next.js endpoints with file/line"
```

---

### Task 5: `lib/ingest/extract-deps.ts`

**Files:**
- Create: `lib/ingest/extract-deps.ts`
- Create: `tests/ingest/extract-deps.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractDeps, parseEnvExample } from '@/lib/ingest/extract-deps';

const FIX = path.resolve(__dirname, '../fixtures/repos/ecommerce-gateway');
function read(rel: string) { return { path: rel, content: fs.readFileSync(path.join(FIX, rel), 'utf8') }; }

describe('extractDeps', () => {
  it('finds env URL references in source', () => {
    const deps = extractDeps(
      [read('src/clients/serviceUrls.js')],
      {},
    );
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
```

- [ ] **Step 2: Run test (expect failure)**

Run: `npx vitest run tests/ingest/extract-deps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/ingest/extract-deps.ts
import { ENV_URL_RE, ENV_LINE_RE } from './patterns';
import type { OutboundDep } from './types';

interface SourceFile { path: string; content: string }

export function parseEnvExample(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  ENV_LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENV_LINE_RE.exec(content)) !== null) {
    const [, name, raw] = m;
    if (!name) continue;
    out[name] = raw.trim();
  }
  return out;
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function extractDeps(files: SourceFile[], envExample: Record<string, string>): OutboundDep[] {
  const seen = new Map<string, OutboundDep>();

  for (const f of files) {
    ENV_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ENV_URL_RE.exec(f.content)) !== null) {
      const envVar = m[1];
      if (seen.has(envVar)) continue;
      seen.set(envVar, {
        envVar,
        urlExample: envExample[envVar],
        file: f.path,
        line: lineOf(f.content, m.index),
      });
    }
  }

  return Array.from(seen.values());
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ingest/extract-deps.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/extract-deps.ts tests/ingest/extract-deps.test.ts
git commit -m "feat(ingest): extract env-based outbound deps + parse .env.example"
```

---

### Task 6: GitHub Contents client

**Files:**
- Create: `lib/ingest/github-client.ts`
- Create: `lib/ingest/github-contents.ts`

No tests for these (they wrap network calls; integration tested via the orchestrator with mocks in Task 7). We want them small and obvious.

- [ ] **Step 1: Install Octokit**

Run: `npm install @octokit/rest@^21`
Expected: no peer warnings.

- [ ] **Step 2: Write `lib/ingest/github-client.ts`**

```ts
import { Octokit } from '@octokit/rest';

// v1: unauthenticated for public repos (60 req/hr/IP). SP5 will accept an
// installation token from a GithubInstallation row and use it here.
export function makeOctokit(token?: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: 'servicelens-ingest/0.1',
  });
}

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export function parseRepoUrl(repoUrl: string): RepoRef | null {
  // Accepts https://github.com/{owner}/{repo}(.git)? with optional trailing /
  const m = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: 'main' };
}
```

- [ ] **Step 3: Write `lib/ingest/github-contents.ts`**

```ts
import type { Octokit } from '@octokit/rest';
import type { RepoRef } from './github-client';

export interface TreeEntry { path: string; type: 'blob' | 'tree'; size?: number }

const MAX_FILES = 200;
const MAX_FILE_BYTES = 200_000;

// Returns blob entries only, capped at MAX_FILES, filtered to interesting paths.
export async function listInterestingTree(
  octokit: Octokit,
  ref: RepoRef,
): Promise<{ commitSha: string; entries: TreeEntry[] }> {
  // Resolve branch to a commit sha first.
  const branch = await octokit.repos.getBranch({ owner: ref.owner, repo: ref.repo, branch: ref.branch });
  const commitSha = branch.data.commit.sha;
  const tree = await octokit.git.getTree({
    owner: ref.owner,
    repo: ref.repo,
    tree_sha: commitSha,
    recursive: 'true',
  });
  const all = (tree.data.tree ?? []) as TreeEntry[];
  const interesting = all
    .filter((e) => e.type === 'blob' && isInteresting(e.path))
    .slice(0, MAX_FILES);
  return { commitSha, entries: interesting };
}

export async function readFile(
  octokit: Octokit,
  ref: RepoRef,
  filePath: string,
): Promise<string | null> {
  const res = await octokit.repos.getContent({
    owner: ref.owner,
    repo: ref.repo,
    path: filePath,
    ref: ref.branch,
  });
  // getContent returns either a file object or an array (for directories) or symlink.
  const data = res.data as { type?: string; size?: number; content?: string; encoding?: string };
  if (Array.isArray(res.data) || data.type !== 'file' || !data.content) return null;
  if ((data.size ?? 0) > MAX_FILE_BYTES) return null;
  if (data.encoding !== 'base64') return null;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

const SOURCE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;
const EXCLUDE_DIR_RE = /(?:^|\/)(?:node_modules|\.next|dist|build|coverage|\.git)(?:\/|$)/;

function isInteresting(p: string): boolean {
  if (EXCLUDE_DIR_RE.test(p)) return false;
  if (p === '.env.example' || p === 'package.json' || p === 'README.md') return true;
  if (/^src\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^app\//.test(p) && /\/route\.(ts|js|tsx|jsx)$/.test(p)) return true;
  if (/^pages\/api\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^api\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  if (/^routes\//.test(p) && SOURCE_EXT_RE.test(p)) return true;
  return false;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/github-client.ts lib/ingest/github-contents.ts package.json package-lock.json
git commit -m "feat(ingest): octokit-backed Contents client (parse URL, list tree, read file)"
```

---

### Task 7: `lib/ingest/ingest-service.ts` orchestrator

**Files:**
- Create: `lib/ingest/ingest-service.ts`
- Create: `tests/ingest/ingest-service.test.ts`

- [ ] **Step 1: Write failing test (uses an injectable file fetcher — no network)**

```ts
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
```

- [ ] **Step 2: Run test (expect failure)**

Run: `npx vitest run tests/ingest/ingest-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/ingest/ingest-service.ts
import { extractEndpoints } from './extract-endpoints';
import { extractDeps, parseEnvExample } from './extract-deps';
import { makeOctokit, parseRepoUrl } from './github-client';
import { listInterestingTree, readFile } from './github-contents';
import type { ServiceContract, EnvVar } from './types';

interface SourceFile { path: string; content: string }

function detectFramework(files: SourceFile[]): ServiceContract['framework'] {
  const pkg = files.find((f) => f.path === 'package.json');
  if (pkg) {
    try {
      const j = JSON.parse(pkg.content);
      const deps = { ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}) };
      if (deps.next) {
        if (files.some((f) => f.path.startsWith('app/') && f.path.endsWith('route.ts'))) return 'nextjs-app';
        if (files.some((f) => f.path.startsWith('app/') && f.path.endsWith('route.js'))) return 'nextjs-app';
        if (files.some((f) => f.path.startsWith('pages/api/'))) return 'nextjs-pages';
        return 'nextjs-app';
      }
      if (deps.express) return 'express';
      if (deps.fastify) return 'fastify';
    } catch { /* fall through */ }
  }
  return 'unknown';
}

/**
 * Pure synchronous orchestrator over a set of pre-loaded files.
 * Used by ingestService() and by tests with local fixtures.
 */
export function ingestFromFiles(files: SourceFile[], commitSha?: string): ServiceContract {
  const envExampleFile = files.find((f) => f.path === '.env.example');
  const envExample = envExampleFile ? parseEnvExample(envExampleFile.content) : {};

  const endpoints = extractEndpoints(files);
  const outboundDeps = extractDeps(files, envExample);
  const envVars: EnvVar[] = Object.entries(envExample).map(([name, defaultValue]) => ({ name, defaultValue }));

  return {
    endpoints,
    outboundDeps,
    envVars,
    framework: detectFramework(files),
    commitSha,
  };
}

/**
 * Live ingester. Resolves the repo via GitHub Contents API and assembles a contract.
 */
export async function ingestService(opts: {
  repoUrl: string;
  branch?: string;
  githubToken?: string;
}): Promise<ServiceContract> {
  const ref = parseRepoUrl(opts.repoUrl);
  if (!ref) throw new Error(`Unsupported repo URL: ${opts.repoUrl}`);
  ref.branch = opts.branch ?? ref.branch;
  const octokit = makeOctokit(opts.githubToken);

  const { commitSha, entries } = await listInterestingTree(octokit, ref);

  const files: SourceFile[] = [];
  for (const entry of entries) {
    const content = await readFile(octokit, ref, entry.path);
    if (content != null) files.push({ path: entry.path, content });
  }

  return ingestFromFiles(files, commitSha);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ingest/ingest-service.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Run entire ingest test suite**

Run: `npx vitest run tests/ingest`
Expected: all ingest tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/ingest-service.ts tests/ingest/ingest-service.test.ts
git commit -m "feat(ingest): ingestFromFiles + ingestService orchestrator"
```

---

### Task 8: Persist `ServiceContract` + wire new analyze pipeline

**Files:**
- Create: `lib/ingest/persist.ts`
- Modify: `app/api/architectures/[id]/analyze/route.ts`
- Modify: `app/api/architectures/[id]/services/route.ts`

- [ ] **Step 1: Write `lib/ingest/persist.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { stringify } from '@/lib/utils';
import type { ServiceContract } from './types';

export async function saveContract(serviceId: string, contract: ServiceContract): Promise<void> {
  await prisma.serviceContract.upsert({
    where: { serviceId },
    create: {
      serviceId,
      endpoints: stringify(contract.endpoints),
      outboundDeps: stringify(contract.outboundDeps),
      envVars: stringify(contract.envVars),
      framework: contract.framework,
      commitSha: contract.commitSha,
    },
    update: {
      endpoints: stringify(contract.endpoints),
      outboundDeps: stringify(contract.outboundDeps),
      envVars: stringify(contract.envVars),
      framework: contract.framework,
      commitSha: contract.commitSha,
      extractedAt: new Date(),
    },
  });

  // Mirror the surface fields into Service columns so existing UI keeps working
  // without reading the new ServiceContract row.
  await prisma.service.update({
    where: { id: serviceId },
    data: {
      framework: contract.framework === 'unknown' ? null : contract.framework,
      exposesApis: stringify(contract.endpoints.map((e) => `${e.method} ${e.path}`)),
      consumesApis: stringify(contract.outboundDeps.map((d) => d.envVar)),
      analysisStatus: 'completed',
    },
  });
}
```

- [ ] **Step 2: Modify the services POST route — accept `deployedUrl`, `provider`**

Replace the file contents:

```ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

const addSchema = z.object({
  name: z.string().min(1).max(120),
  repoUrl: z.string().url(),
  deployedUrl: z.string().url().optional(),
  provider: z.enum(['github', 'bitbucket_soon', 'gitlab_soon']).default('github'),
  branch: z.string().default('main'),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const architecture = await prisma.architecture.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!architecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.provider !== 'github') {
    return NextResponse.json({ error: `Provider ${parsed.data.provider} not yet supported — coming soon` }, { status: 400 });
  }

  const service = await prisma.service.create({
    data: {
      architectureId: params.id,
      name: parsed.data.name,
      repoUrl: parsed.data.repoUrl,
      branch: parsed.data.branch,
      provider: parsed.data.provider,
      deployedUrl: parsed.data.deployedUrl ?? null,
      analysisStatus: 'pending',
    },
  });
  return NextResponse.json({ service });
}
```

- [ ] **Step 3: Modify the analyze route — call new pipeline**

Replace the body of the `for (const svc of pending)` loop in `app/api/architectures/[id]/analyze/route.ts` with:

```ts
    try {
      await prisma.service.update({ where: { id: svc.id }, data: { analysisStatus: 'analyzing' } });
      const contract = await ingestService({ repoUrl: svc.repoUrl, branch: svc.branch });
      await saveContract(svc.id, contract);
    } catch (err) {
      await prisma.service.update({
        where: { id: svc.id },
        data: {
          analysisStatus: 'error',
          analysisResult: stringify({ error: err instanceof Error ? err.message : 'unknown' }),
        },
      });
    }
```

And replace imports:

```ts
import { ingestService } from '@/lib/ingest/ingest-service';
import { saveContract } from '@/lib/ingest/persist';
```

Remove now-unused imports: `cloneShallow`, `extractKeyFiles`, `cleanup`, `heuristicAnalyze`, `analyzeServiceWithAI`, `isAIEnabled`. Keep `buildTopology` (used after the loop). Keep `stringify`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Run full vitest suite**

Run: `npm test`
Expected: existing 47 tests still pass + new ingest tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/persist.ts app/api/architectures/'[id]'/services/route.ts app/api/architectures/'[id]'/analyze/route.ts
git commit -m "feat(ingest): wire new pipeline into /analyze + accept deployedUrl on service create"
```

---

### Task 9: Manual smoke test against a real repo

This task is NOT executed by the implementing agent — it is a human checkpoint after Task 8.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Create an architecture in the UI** named "E-Commerce Real".

- [ ] **Step 3: Use the API to add a real service** (browser console, signed-in session):

```js
fetch('/api/architectures/<archId>/services', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'ecommerce-gateway',
    repoUrl: 'https://github.com/buildlab-devs/ecommerce-gateway',
    deployedUrl: 'https://ecommerce-gateway.vercel.app',
  }),
}).then((r) => r.json()).then(console.log);
```

- [ ] **Step 4: Trigger analyze**

```js
fetch('/api/architectures/<archId>/analyze', { method: 'POST' }).then((r) => r.json()).then(console.log);
```

- [ ] **Step 5: Verify a `ServiceContract` row exists**

```bash
npx prisma studio
# Open the ServiceContract table — confirm endpoints[] and outboundDeps[] populated.
```

Expected: a row with `framework=express`, `endpoints` contains `/health` and `/api/auth/register`, `outboundDeps` contains `AUTH_SERVICE_URL` with `urlExample=http://localhost:4001`.

If anything fails: STOP and report the failure to the user.

---

## Done criteria for SP1

- All vitest suites green (`npm test`).
- `npm run typecheck` clean.
- The smoke test in Task 9 passes against `buildlab-devs/ecommerce-gateway` from a live dev server.
- A `ServiceContract` row is created/updated on every `/analyze` invocation, and `Service.exposesApis` + `Service.consumesApis` mirror the contract for backward compatibility with the existing topology builder.
