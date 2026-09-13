// AI fix generation from real source.
//
// 1. Pick the files most likely to hold the fault: files the service contract
//    points at (routes, outbound-dependency clients), ranked by what the RCA mentions.
// 2. Read them from GitHub at the branch HEAD commit (pinned SHA).
// 3. Ask the model for the COMPLETE new content of the files it changes — not a
//    diff: models can't count line offsets, so hand-written hunks rarely apply.
// 4. Compute the unified diff ourselves and validate it (only given files,
//    something actually changed, not a wholesale rewrite).
//
// What the UI shows is exactly what `lib/remediation.ts` commits. No heuristic
// fallback: without a working LLM this fails with AiUnavailableError.

import crypto from 'node:crypto';
import { z } from 'zod';
import { createTwoFilesPatch, structuredPatch } from 'diff';
import { prisma } from './prisma';
import { parseJson } from './utils';
import { assembleContext, type RcaContext } from './rca';
import { chatOnce, currentModel, type ChatMessage } from './openrouter-stream';
import { makeOctokit, parseRepoUrl } from './ingest/github-client';
import { listInterestingTree, readFiles } from './ingest/github-contents';
import { readTokenForRepo } from './github/app';
import type { Endpoint, OutboundDep } from './ingest/types';

const MAX_CANDIDATES = 5;
const MAX_CHANGED_FILES = 3;
const MAX_FILE_BYTES = 12_000;
const MAX_TOTAL_BYTES = 36_000;

export class FixPrError extends Error {
  constructor(
    public code: 'demo' | 'no_rca' | 'no_repo' | 'no_contract' | 'no_code_change' | 'invalid_output' | 'too_broad',
    message: string,
    public status = 422
  ) {
    super(message);
    this.name = 'FixPrError';
  }
}

// ── Model output ────────────────────────────────────────────────────────────
const ModelFile = z.object({ path: z.string().min(1), content: z.string() });
const ModelFixSchema = z.union([
  z.object({ noChange: z.literal(true), reason: z.string().min(1) }),
  z.object({
    summary: z.string().min(1),
    prTitle: z.string().min(1),
    prBody: z.string().min(1),
    files: z.array(ModelFile).min(1).max(MAX_CHANGED_FILES),
  }),
]);
export type ModelFix = z.infer<typeof ModelFixSchema>;

// Defensive parsing: models occasionally wrap JSON in code fences or prose.
export function parseModelFix(raw: string): ModelFix {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  return ModelFixSchema.parse(JSON.parse(slice));
}

// ── Stored proposal (IncidentEvent `fix_pr_generated`) ───────────────────────
const StoredFile = z.object({
  path: z.string(),
  patch: z.string(),
  content: z.string().optional(), // full new content (v2) — what gets committed
  blobSha: z.string().optional(), // git blob SHA of the original, for conflict checks
});
const StoredFixSchema = z.object({
  version: z.number().optional(),
  summary: z.string(),
  branchName: z.string(),
  files: z.array(StoredFile).min(1),
  prTitle: z.string(),
  prBody: z.string(),
  repo: z.string().optional(),
  baseBranch: z.string().optional(),
  baseSha: z.string().optional(),
  model: z.string().optional(),
});
export type FixPr = z.infer<typeof StoredFixSchema>;

// Same algorithm as `git hash-object`.
export function gitBlobSha(content: string): string {
  const buf = Buffer.from(content, 'utf8');
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

export function branchNameFor(incidentId: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return `servicelens/incident-${incidentId.slice(-8)}${slug ? `-${slug}` : ''}`;
}

// Rank contract files by how strongly the RCA points at them.
export function pickCandidateFiles(
  contract: { endpoints: Endpoint[]; outboundDeps: OutboundDep[] },
  rca: string,
  existing: Set<string>
): string[] {
  const text = rca.toLowerCase();
  const score = new Map<string, number>();
  const bump = (file: string, n: number) => score.set(file, (score.get(file) ?? 0) + n);

  for (const e of contract.endpoints) {
    bump(e.file, 1);
    if (e.path.length > 1 && text.includes(e.path.toLowerCase())) bump(e.file, 2);
  }
  for (const d of contract.outboundDeps) {
    bump(d.file, 2);
    if (text.includes(d.envVar.toLowerCase())) bump(d.file, 3);
  }
  for (const f of Array.from(score.keys())) {
    const base = f.split('/').pop()!.toLowerCase();
    if (text.includes(f.toLowerCase())) bump(f, 5);
    else if (base.length > 4 && text.includes(base)) bump(f, 3);
  }
  return Array.from(score.entries())
    .filter(([f]) => existing.has(f) && !/(^|\/)\.env/.test(f))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CANDIDATES)
    .map(([f]) => f);
}

export interface FileChange {
  path: string;
  patch: string;
  content: string;
  blobSha: string;
}

// Turn the model's full-file output into validated changes with real diffs.
export function buildChanges(files: Array<{ path: string; content: string }>, originals: Map<string, string>): FileChange[] {
  const out: FileChange[] = [];
  for (const f of files) {
    const before = originals.get(f.path);
    if (before === undefined) throw new FixPrError('invalid_output', `The model tried to edit ${f.path}, which it was not given.`);
    let after = f.content;
    if (before.endsWith('\n') && !after.endsWith('\n')) after += '\n';
    if (after === before) continue;

    const lines = before.split('\n').length;
    const changed = structuredPatch(f.path, f.path, before, after, '', '', { context: 0 }).hunks.reduce(
      (n, h) => n + h.lines.filter((l) => l.startsWith('+') || l.startsWith('-')).length,
      0
    );
    if (lines > 40 && changed > lines * 1.2) {
      throw new FixPrError('too_broad', `The model rewrote most of ${f.path} (${changed} changed lines). Refusing a change that broad — regenerate.`);
    }

    const raw = createTwoFilesPatch(`a/${f.path}`, `b/${f.path}`, before, after, undefined, undefined, { context: 3 });
    const patch = raw.slice(Math.max(0, raw.indexOf('--- ')));
    out.push({ path: f.path, patch, content: after, blobSha: gitBlobSha(before) });
  }
  if (out.length === 0) throw new FixPrError('no_code_change', 'The model returned the files unchanged, so there is no code fix to propose.');
  return out;
}

function buildPrompt(ctx: RcaContext, rca: string, files: Array<{ path: string; content: string }>, commitSha: string): ChatMessage[] {
  const system = [
    'You are a senior engineer fixing a production incident.',
    'You get the root-cause analysis and the current contents of the most relevant source files from the service repository.',
    'Propose the smallest safe code change that addresses the root cause.',
    'Rules:',
    '- Only modify files you were given. Never invent paths.',
    `- Change at most ${MAX_CHANGED_FILES} files.`,
    '- For each changed file return its COMPLETE new content (not a diff). Keep every unrelated line byte-for-byte identical: no reformatting, no import reordering, no comment rewording.',
    '- Prefer targeted fixes (timeouts, retries, error handling, validation, config defaults) over refactors.',
    '- If the root cause is not fixable in these files (infrastructure, capacity, an external dependency being down, missing secrets), return {"noChange": true, "reason": "<one sentence>"}.',
    'Respond with a single JSON object and nothing else.',
  ].join('\n');

  const lines: string[] = [];
  lines.push(`Architecture: "${ctx.architectureName}"`);
  if (ctx.serviceName) lines.push(`Affected service: "${ctx.serviceName}"`);
  lines.push(`Incident: ${ctx.incident.title} (${ctx.incident.severity})`);
  lines.push('');
  lines.push('## Root-cause analysis');
  lines.push(rca.slice(0, 3000));
  lines.push('');
  if (ctx.priorResolved.length) {
    lines.push('## Prior resolutions that worked on this service');
    lines.push(ctx.priorResolved.map((p) => `- "${p.title}": ${p.resolution}`).join('\n'));
    lines.push('');
  }
  lines.push(`## Source files (at commit ${commitSha.slice(0, 7)})`);
  for (const f of files) {
    lines.push(`### FILE: ${f.path}`);
    lines.push('```');
    lines.push(f.content);
    lines.push('```');
  }
  lines.push('');
  lines.push(`Return JSON exactly matching either:
{"summary": "one sentence: what and why", "prTitle": "short PR title", "prBody": "markdown with ## Why, ## What changed, ## How to test", "files": [{"path": "one of the paths above", "content": "complete new file content"}]}
or
{"noChange": true, "reason": "why no code change in these files can fix it"}`);

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}

export async function generateFixPr(incidentId: string): Promise<FixPr> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: {
      id: true,
      rcaMarkdown: true,
      architecture: { select: { demo: true } },
      service: { select: { id: true, repoUrl: true, branch: true, contract: { select: { endpoints: true, outboundDeps: true } } } },
    },
  });
  if (!incident) throw new Error('incident not found');
  if (incident.architecture.demo) {
    throw new FixPrError('demo', 'Fix PRs are generated from a real repository, and the demo mesh has no source to fix. Onboard one of your own services to try it.');
  }
  if (!incident.rcaMarkdown) throw new FixPrError('no_rca', 'Generate the root-cause analysis first — the fix is built from it.', 409);
  const service = incident.service;
  if (!service) throw new FixPrError('no_repo', 'This incident is not tied to a service, so there is no repository to fix.');
  if (!service.contract) throw new FixPrError('no_contract', 'Analyze this service first so ServiceLens knows which files handle what.', 409);

  const ref = parseRepoUrl(service.repoUrl);
  if (!ref) throw new FixPrError('no_repo', `Unsupported repository URL: ${service.repoUrl}`);
  ref.branch = service.branch;

  const token = await readTokenForRepo(service.repoUrl);
  const octokit = makeOctokit(token);
  const tree = await listInterestingTree(octokit, ref);
  const candidates = pickCandidateFiles(
    {
      endpoints: parseJson<Endpoint[]>(service.contract.endpoints, []),
      outboundDeps: parseJson<OutboundDep[]>(service.contract.outboundDeps, []),
    },
    incident.rcaMarkdown,
    new Set(tree.entries.map((e) => e.path))
  );
  if (candidates.length === 0) {
    throw new FixPrError('no_contract', 'No source files from the service contract exist at the branch HEAD. Re-analyze the service.', 409);
  }

  const read = await readFiles(octokit, ref, candidates, tree.commitSha, { authenticated: !!token });
  const files: Array<{ path: string; content: string }> = [];
  let total = 0;
  for (const f of read) {
    const size = Buffer.byteLength(f.content);
    if (size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) continue;
    files.push(f);
    total += size;
  }
  if (files.length === 0) throw new FixPrError('no_contract', 'The relevant files are too large to send to the model.', 422);

  const ctx = await assembleContext(incidentId);
  if (!ctx) throw new Error('incident not found');

  const raw = await chatOnce(buildPrompt(ctx, incident.rcaMarkdown, files, tree.commitSha), {
    temperature: 0.1,
    responseFormat: 'json_object',
    maxTokens: 6000,
    strict: true,
  });

  let parsed: ModelFix;
  try {
    parsed = parseModelFix(raw);
  } catch {
    throw new FixPrError('invalid_output', 'The model returned malformed output. Try generating again.');
  }
  if ('noChange' in parsed) throw new FixPrError('no_code_change', `No safe code change in this service: ${parsed.reason}`);

  const changes = buildChanges(parsed.files, new Map(files.map((f) => [f.path, f.content])));
  const fix: FixPr = {
    version: 2,
    summary: parsed.summary,
    prTitle: parsed.prTitle,
    prBody: parsed.prBody,
    branchName: branchNameFor(incidentId, parsed.prTitle),
    repo: `${ref.owner}/${ref.repo}`,
    baseBranch: tree.branch,
    baseSha: tree.commitSha,
    files: changes,
    model: currentModel(),
  };
  await prisma.incidentEvent.create({
    data: { incidentId, type: 'fix_pr_generated', payload: JSON.stringify(fix) },
  });
  return fix;
}

// Latest proposal for the incident (hydrates the UI on page load).
export async function loadLatestFixPr(incidentId: string): Promise<FixPr | null> {
  const ev = await prisma.incidentEvent.findFirst({
    where: { incidentId, type: 'fix_pr_generated' },
    orderBy: { at: 'desc' },
  });
  if (!ev?.payload) return null;
  const parsed = StoredFixSchema.safeParse(parseJson<unknown>(ev.payload, null));
  return parsed.success ? parsed.data : null;
}

// Proposals from before v2 carry only model-written patches; they can be
// previewed but not opened as a PR.
export function isCommittable(fix: FixPr | null): boolean {
  return !!fix && !!fix.baseSha && !!fix.repo && fix.files.every((f) => typeof f.content === 'string' && !!f.blobSha);
}

// A single .patch file (concatenation of the per-file unified diffs).
export function renderPatch(fix: Pick<FixPr, 'files'>): string {
  return fix.files.map((f) => f.patch.trim() + '\n').join('\n');
}
