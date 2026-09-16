import { hasWorkersAiCredentials } from './workers-ai-keys';

// Whether an LLM is configured (WORKERS_AI_CREDENTIALS or WORKERS_AI_CREDENTIAL).
// The actual calls live in lib/openrouter-stream.ts.
export function isAIEnabled(): boolean {
  return hasWorkersAiCredentials();
}
