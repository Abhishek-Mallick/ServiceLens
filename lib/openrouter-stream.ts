// Streaming wrapper around Cloudflare Workers AI's OpenAI-compatible endpoint.
// Yields content-delta strings; emits a final marker via the returned promise's
// resolution. Falls back to a heuristic generator when the credential pool is
// empty OR fully cooled-down, so the UX works without any keys.

import {
  classifyWorkersAiResponse,
  credentialCount,
  credentialKey,
  hasWorkersAiCredentials,
  markFailed,
  parseRetryAfterMs,
  pickCredential,
  type WorkersAiCredential,
} from './workers-ai-keys';

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  model?: string;
  temperature?: number;
  responseFormat?: 'text' | 'json_object';
  maxTokens?: number;
  // Never fall back to the heuristic generator — throw AiUnavailableError
  // instead. Required wherever output becomes real changes (fix PRs).
  strict?: boolean;
}

export class AiUnavailableError extends Error {
  constructor(public reason: 'not_configured' | 'rate_limited', public retryAfterSec?: number) {
    super(
      reason === 'not_configured'
        ? 'No AI provider configured. Set WORKERS_AI_CREDENTIALS (accountId::token pairs, comma-separated) to generate fixes.'
        : retryAfterSec
          ? `Workers AI is rate-limited right now. Try again in ~${retryAfterSec}s or add credentials from separate Cloudflare accounts.`
          : 'Every Workers AI credential is rate-limited right now. Wait a minute or add more accountId::token pairs from separate accounts.'
    );
    this.name = 'AiUnavailableError';
  }
}

export function isStreamingEnabled(): boolean {
  return hasWorkersAiCredentials();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maxAttempts(): number {
  return Math.max(credentialCount(), 1) * 3;
}

function currentModelName(): string {
  return process.env.WORKERS_AI_MODEL ?? DEFAULT_MODEL;
}

function chatUrl(accountId: string): string {
  const override = process.env.WORKERS_AI_BASE_URL?.replace(/\/+$/, '');
  if (override) return `${override}/chat/completions`;
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
}

async function postChat(
  cred: WorkersAiCredential,
  messages: ChatMessage[],
  opts: StreamOptions,
  stream: boolean,
): Promise<Response> {
  const model = opts.model ?? currentModelName();
  return fetch(chatUrl(cred.accountId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cred.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      stream,
      ...(opts.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    }),
  });
}

type ChatAttempt =
  | { ok: true; res: Response; cred: WorkersAiCredential }
  | { ok: false; reason: 'rate_limited'; retryAfterSec?: number };

async function requestChat(messages: ChatMessage[], opts: StreamOptions, stream: boolean): Promise<ChatAttempt> {
  let lastRetryAfterSec: number | undefined;
  for (let attempt = 0; attempt < maxAttempts(); attempt++) {
    const cred = pickCredential();
    if (!cred) break;

    const res = await postChat(cred, messages, opts, stream);
    if (res.ok) return { ok: true, res, cred };

    const body = await res.text().catch(() => '');
    const retryAfterMs = parseRetryAfterMs(res.headers);
    if (retryAfterMs) lastRetryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const plan = classifyWorkersAiResponse(res.status, body, retryAfterMs);

    if (plan.action === 'fail') throw new Error(plan.message);
    if (plan.markCredentialFailed) {
      markFailed(cred, plan.waitMs);
      console.warn(`[workers-ai] credential cooled (${res.status}); rotating (${credentialKey(cred).slice(0, 12)}…)`);
    } else {
      console.warn(`[workers-ai] upstream ${res.status}; retrying in ${plan.waitMs}ms`);
    }
    await sleep(plan.waitMs);
  }

  return { ok: false, reason: 'rate_limited', retryAfterSec: lastRetryAfterSec };
}

// Async iterable of content deltas. Caller is responsible for assembling them.
// Rotates through the WORKERS_AI_CREDENTIALS pool — on a rate-limit response we
// cool that credential down and retry the *same* request with the next available
// entry. When every credential is exhausted we degrade to the heuristic stream.
export async function* streamChat(messages: ChatMessage[], opts: StreamOptions = {}): AsyncGenerator<string, void, unknown> {
  if (!hasWorkersAiCredentials()) {
    yield* heuristicStream(messages);
    return;
  }

  const attempt = await requestChat(messages, opts, true);
  if (!attempt.ok) {
    console.warn('[workers-ai] all credentials cooling down — falling back to heuristic');
    yield* heuristicStream(messages);
    return;
  }

  const decoder = new TextDecoder();
  const reader = attempt.res.body!.getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    // Workers AI OpenAI-compatible endpoint follows the same SSE shape.
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content ?? '';
        if (delta) yield delta as string;
      } catch {
        // Ignore keep-alive comments / malformed lines.
      }
    }
  }
}

// Non-streaming variant — accumulates and returns once. Used for the fix-PR
// pass where we want a single JSON document. Same rotation semantics.
export async function chatOnce(messages: ChatMessage[], opts: StreamOptions = {}): Promise<string> {
  if (!hasWorkersAiCredentials()) {
    if (opts.strict) throw new AiUnavailableError('not_configured');
    return heuristicCompletion(messages, opts.responseFormat === 'json_object');
  }

  const attempt = await requestChat(messages, opts, false);
  if (!attempt.ok) {
    if (opts.strict) throw new AiUnavailableError('rate_limited', attempt.retryAfterSec);
    console.warn('[workers-ai] all credentials cooling down — falling back to heuristic');
    return heuristicCompletion(messages, opts.responseFormat === 'json_object');
  }

  const json = await attempt.res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

// Small helper used to surface the model name into the UI / persistence.
export function currentModel(): string {
  return currentModelName();
}

// ── Fallbacks (no API key) ───────────────────────────────────────────────────

async function* heuristicStream(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
  const text = heuristicCompletion(messages, false);
  // Emit a chunk roughly every 30ms so the UI feels alive.
  const words = text.split(/(\s+)/);
  for (const w of words) {
    yield w;
    await new Promise((r) => setTimeout(r, 25));
  }
}

function heuristicCompletion(messages: ChatMessage[], jsonShape: boolean): string {
  const user = messages.find((m) => m.role === 'user')?.content ?? '';
  // Pull a few signals from the assembled prompt
  const service = match(user, /Service:\s*"([^"]+)"/) ?? 'the affected service';
  const errors = (user.match(/error/gi) ?? []).length;
  const downCount = (user.match(/\bdown\b/gi) ?? []).length;
  const summary = downCount > 0
    ? `${service} appears to be unreachable based on recent probe results, with ${errors} error-level log lines clustered around the incident window.`
    : `${service} has elevated error rates and a small number of degraded health checks in the trailing window.`;

  if (jsonShape) {
    return JSON.stringify({
      summary,
      branchName: `fix/incident-${Date.now().toString(36).slice(-6)}`,
      files: [
        {
          path: 'README.md',
          patch: '--- a/README.md\n+++ b/README.md\n@@ -1,1 +1,2 @@\n # Project\n+# TODO: investigate ' + service + ' incident\n',
        },
      ],
      prTitle: `Investigate ${service} incident`,
      prBody: summary + '\n\n*(Heuristic fix suggestion — set WORKERS_AI_CREDENTIALS for AI-generated patches.)*',
    });
  }

  return [
    `## Likely root cause`,
    summary,
    ``,
    `## Evidence`,
    `- Health window shows ${downCount} down/unreachable check(s).`,
    `- Logs collected at incident open contain ${errors} \`error\` entries.`,
    `- This is the heuristic fallback summary — set \`WORKERS_AI_CREDENTIALS\` in \`.env\` to stream a real AI analysis with citations.`,
    ``,
    `## Suggested next steps`,
    `1. Verify upstream dependencies are reachable from ${service}.`,
    `2. Inspect the most recent deploy of ${service} for config drift.`,
    `3. Roll back if errors began after a recent change.`,
  ].join('\n');
}

function match(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}
