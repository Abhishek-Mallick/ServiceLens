// Streaming wrapper around OpenRouter's chat-completions endpoint.
// Yields content-delta strings; emits a final marker via the returned promise's
// resolution. Falls back to a heuristic generator when the API key pool is
// empty OR fully cooled-down, so the UX works without any keys.

import {
  classifyOpenRouterResponse,
  hasOpenRouterKeys,
  keyCount,
  markFailed,
  parseRetryAfterMs,
  pickKey,
} from './openrouter-keys';

// Override for OpenAI-compatible proxies / gateways.
const BASE_URL = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

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
    const model = process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';
    const freeHint = model.endsWith(':free')
      ? ' Free models are capped at 20 requests/min and 50/day per OpenRouter account (1000/day after $10 in credits). Keys from the same account share that quota.'
      : '';
    super(
      reason === 'not_configured'
        ? 'No AI provider configured. Set OPENROUTER_API_KEY (or a comma-separated OPENROUTER_API_KEYS pool) to generate fixes.'
        : retryAfterSec
          ? `OpenRouter is rate-limited right now.${freeHint} Try again in ~${retryAfterSec}s, add keys from separate accounts, or switch to a paid model.`
          : `Every OpenRouter key is rate-limited right now.${freeHint} Wait a minute, add more keys from separate accounts, or switch to a paid model.`
    );
    this.name = 'AiUnavailableError';
  }
}

export function isStreamingEnabled(): boolean {
  return hasOpenRouterKeys();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maxAttempts(): number {
  return Math.max(keyCount(), 1) * 3;
}

async function postChat(
  apiKey: string,
  messages: ChatMessage[],
  opts: StreamOptions,
  stream: boolean,
): Promise<Response> {
  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';
  return fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'ServiceLens',
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

type ChatAttempt = { ok: true; res: Response; apiKey: string } | { ok: false; reason: 'rate_limited'; retryAfterSec?: number };

async function requestChat(messages: ChatMessage[], opts: StreamOptions, stream: boolean): Promise<ChatAttempt> {
  let lastRetryAfterSec: number | undefined;
  for (let attempt = 0; attempt < maxAttempts(); attempt++) {
    const apiKey = pickKey();
    if (!apiKey) break;

    const res = await postChat(apiKey, messages, opts, stream);
    if (res.ok) return { ok: true, res, apiKey };

    const body = await res.text().catch(() => '');
    const retryAfterMs = parseRetryAfterMs(res.headers);
    if (retryAfterMs) lastRetryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const plan = classifyOpenRouterResponse(res.status, body, retryAfterMs);

    if (plan.action === 'fail') throw new Error(plan.message);
    if (plan.markKeyFailed) {
      markFailed(apiKey, plan.waitMs);
      console.warn(`[openrouter] key cooled (${res.status}); rotating`);
    } else {
      console.warn(`[openrouter] upstream ${res.status}; retrying in ${plan.waitMs}ms`);
    }
    await sleep(plan.waitMs);
  }

  return { ok: false, reason: 'rate_limited', retryAfterSec: lastRetryAfterSec };
}

// Async iterable of content deltas. Caller is responsible for assembling them.
// Rotates through the OPENROUTER_API_KEYS pool — on a rate-limit response we
// cool that key down and retry the *same* request with the next available
// key. When every key is exhausted we degrade to the heuristic stream.
export async function* streamChat(messages: ChatMessage[], opts: StreamOptions = {}): AsyncGenerator<string, void, unknown> {
  if (!hasOpenRouterKeys()) {
    yield* heuristicStream(messages);
    return;
  }

  const attempt = await requestChat(messages, opts, true);
  if (!attempt.ok) {
    console.warn('[openrouter] all keys cooling down — falling back to heuristic');
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
    // OpenRouter follows the OpenAI SSE shape: lines starting with "data: ".
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
// pass where we want a single JSON document. Same key-rotation semantics.
export async function chatOnce(messages: ChatMessage[], opts: StreamOptions = {}): Promise<string> {
  if (!hasOpenRouterKeys()) {
    if (opts.strict) throw new AiUnavailableError('not_configured');
    return heuristicCompletion(messages, opts.responseFormat === 'json_object');
  }

  const attempt = await requestChat(messages, opts, false);
  if (!attempt.ok) {
    if (opts.strict) throw new AiUnavailableError('rate_limited', attempt.retryAfterSec);
    console.warn('[openrouter] all keys cooling down — falling back to heuristic');
    return heuristicCompletion(messages, opts.responseFormat === 'json_object');
  }

  const json = await attempt.res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

// Small helper used to surface the model name into the UI / persistence.
export function currentModel(): string {
  return process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';
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
      prBody: summary + '\n\n*(Heuristic fix suggestion — set OPENROUTER_API_KEY for AI-generated patches.)*',
    });
  }

  return [
    `## Likely root cause`,
    summary,
    ``,
    `## Evidence`,
    `- Health window shows ${downCount} down/unreachable check(s).`,
    `- Logs collected at incident open contain ${errors} \`error\` entries.`,
    `- This is the heuristic fallback summary — set \`OPENROUTER_API_KEY\` in \`.env\` to stream a real AI analysis with citations.`,
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
