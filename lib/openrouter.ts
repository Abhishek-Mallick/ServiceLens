import { hasOpenRouterKeys } from './openrouter-keys';

// Whether an LLM is configured (OPENROUTER_API_KEY or OPENROUTER_API_KEYS).
// The actual calls live in lib/openrouter-stream.ts.
export function isAIEnabled(): boolean {
  return hasOpenRouterKeys();
}
