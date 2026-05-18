// AI fix-PR generator (UI-only v1 — no GitHub App writes yet).
//
// Second LLM pass after RCA: returns a structured JSON object that the UI can
// render as a diff + "Copy as patch" / "Download .patch". Phase 4.3 v2 will
// take this exact JSON and open a real draft PR via the GitHub App.

import { z } from 'zod';
import { prisma } from './prisma';
import { parseJson } from './utils';
import { assembleContext, type RcaContext } from './rca';
import { chatOnce, currentModel, type ChatMessage } from './openrouter-stream';

const FilePatch = z.object({
  path: z.string().min(1),
  // Unified diff (the unified-diff payload). We keep it as a string blob.
  patch: z.string().min(1),
});

const FixPrSchema = z.object({
  summary: z.string().min(1),
  branchName: z.string().min(1),
  files: z.array(FilePatch).min(1),
  prTitle: z.string().min(1),
  prBody: z.string().min(1),
});

export type FixPr = z.infer<typeof FixPrSchema>;

// Defensive parsing: models occasionally wrap JSON in code fences.
export function parseFixPr(raw: string): FixPr {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  const parsed = JSON.parse(slice);
  return FixPrSchema.parse(parsed);
}

function buildPrompt(ctx: RcaContext, rca: string): ChatMessage[] {
  const system = `You are a senior backend engineer. Given a root-cause analysis and minimal context about a microservice, produce a single, conservative pull request that *most likely* addresses the issue. Prefer small, surgical changes (config tweaks, retry/timeout/circuit-breaker adjustments, schema fixes) over large refactors. Always respond with a single JSON object — no markdown fences.`;

  const analysisFiles: string[] = [];
  if (ctx.serviceSummary) analysisFiles.push(`Service summary: ${ctx.serviceSummary.slice(0, 1500)}`);

  const lines: string[] = [];
  lines.push(`Architecture: "${ctx.architectureName}"`);
  if (ctx.serviceName) lines.push(`Affected service: "${ctx.serviceName}"`);
  lines.push('');
  lines.push(`## Root-cause analysis`);
  lines.push(rca.slice(0, 2500));
  lines.push('');
  if (analysisFiles.length) {
    lines.push(`## Service facts`);
    lines.push(analysisFiles.join('\n'));
    lines.push('');
  }
  if (ctx.priorResolved.length) {
    lines.push(`## Prior resolutions that worked on this service`);
    lines.push(ctx.priorResolved.map((p) => `- "${p.title}": ${p.resolution}`).join('\n'));
    lines.push('');
  }
  lines.push(`Return JSON exactly matching:
{
  "summary": "one-sentence what-and-why",
  "branchName": "fix/short-kebab-case",
  "files": [
    { "path": "relative/path/to/file.ext", "patch": "<unified diff with --- and +++ headers and @@ hunks>" }
  ],
  "prTitle": "Short PR title",
  "prBody": "Markdown PR body with sections: ## Why, ## What changed, ## How to test"
}
The patch must be a valid unified diff that could be applied with \`git apply\`. Prefer 1–3 small files. If you genuinely cannot suggest a code change, return a single patch on README.md noting the operational steps to take instead.`);

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}

export async function generateFixPr(incidentId: string): Promise<FixPr> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { id: true, rcaMarkdown: true, architectureId: true, serviceId: true },
  });
  if (!incident) throw new Error('incident not found');
  if (!incident.rcaMarkdown) throw new Error('Generate RCA first');

  const ctx = await assembleContext(incidentId);
  if (!ctx) throw new Error('incident not found');

  const messages = buildPrompt(ctx, incident.rcaMarkdown);
  const raw = await chatOnce(messages, { temperature: 0.15, responseFormat: 'json_object', maxTokens: 1400 });
  let parsed: FixPr;
  try {
    parsed = parseFixPr(raw);
  } catch (err) {
    throw new Error(`Model returned unparseable fix PR JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  await prisma.incidentEvent.create({
    data: {
      incidentId,
      type: 'fix_pr_generated',
      payload: JSON.stringify({ ...parsed, model: currentModel() }),
    },
  });
  return parsed;
}

// Read the most recent fix-PR event for the incident (for hydration on page load).
export async function loadLatestFixPr(incidentId: string): Promise<FixPr | null> {
  const ev = await prisma.incidentEvent.findFirst({
    where: { incidentId, type: 'fix_pr_generated' },
    orderBy: { at: 'desc' },
  });
  if (!ev?.payload) return null;
  try {
    const payload = parseJson<unknown>(ev.payload, null);
    return FixPrSchema.parse(payload);
  } catch {
    return null;
  }
}

// Render a single .patch file blob (concatenation of unified diffs, one per file).
export function renderPatch(fix: FixPr): string {
  return fix.files.map((f) => f.patch.trim() + '\n').join('\n');
}
