// Streaming wrapper around OpenRouter's chat-completions endpoint.
// Yields content-delta strings; emits a final marker via the returned promise's
// resolution. Falls back to a heuristic generator when the API key pool is
// empty OR fully cooled-down, so the UX works without any keys.

import { pickKey, markFailed, isRateLimited, hasOpenRouterKeys } from './openrouter-keys';

const BASE_URL = 'https://openrouter.ai/api/v1';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  model?: string;
  temperature?: number;
  responseFormat?: 'text' | 'json_object';
  maxTokens?: number;
}

export function isStreamingEnabled(): boolean {
  return hasOpenRouterKeys();
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

  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';

  // Try up to N keys before giving up. The pool returns null only when every
  // key is currently in cooldown — at which point we fall back.
  for (let attempt = 0; attempt < 8; attempt++) {
    const apiKey = pickKey();
    if (!apiKey) {
      console.warn('[openrouter] all keys cooling down — falling back to heuristic');
      yield* heuristicStream(messages);
      return;
    }

    const res = await fetch(`${BASE_URL}/chat/completions`, {
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
        stream: true,
        ...(opts.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });

    if (res.status === 429 || res.status >= 500) {
      const body = await res.text().catch(() => '');
      if (isRateLimited(res.status, body) || res.status >= 500) {
        markFailed(apiKey);
        console.warn(`[openrouter] key cooled (${res.status}); rotating`);
        continue; // try next key
      }
    }
    if (!res.ok || !res.body) {
      // Non-rate-limit failures (400, 401, 404 model-not-found) won't improve
      // by retrying with another key — surface immediately.
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter stream error ${res.status}: ${text.slice(0, 500)}`);
    }

    const decoder = new TextDecoder();
    const reader = res.body.getReader();
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

  // Ran out of attempts — every key bounced.
  yield* heuristicStream(messages);
}

// Non-streaming variant — accumulates and returns once. Used for the fix-PR
// pass where we want a single JSON document. Same key-rotation semantics.
export async function chatOnce(messages: ChatMessage[], opts: StreamOptions = {}): Promise<string> {
  if (!hasOpenRouterKeys()) return heuristicCompletion(messages, opts.responseFormat === 'json_object');

  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';

  for (let attempt = 0; attempt < 8; attempt++) {
    const apiKey = pickKey();
    if (!apiKey) {
      console.warn('[openrouter] all keys cooling down — falling back to heuristic');
      return heuristicCompletion(messages, opts.responseFormat === 'json_object');
    }
    const res = await fetch(`${BASE_URL}/chat/completions`, {
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
        ...(opts.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      const body = await res.text().catch(() => '');
      if (isRateLimited(res.status, body) || res.status >= 500) {
        markFailed(apiKey);
        console.warn(`[openrouter] key cooled (${res.status}); rotating`);
        continue;
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  }

  return heuristicCompletion(messages, opts.responseFormat === 'json_object');
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
