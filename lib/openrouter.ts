import type { AIAnalysisResult, RegressionFlow } from './types';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function isAIEnabled(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

async function callOpenRouter(prompt: string, system: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'MeshRegress',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

function safeParseJson<T>(raw: string): T {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  return JSON.parse(slice) as T;
}

export async function analyzeServiceWithAI(serviceName: string, files: Array<{ path: string; content: string }>): Promise<AIAnalysisResult> {
  const filesBlob = files
    .map((f) => `=== ${f.path} ===\n${f.content.slice(0, 4000)}`)
    .join('\n\n')
    .slice(0, 40000);

  const prompt = `You are analyzing the microservice "${serviceName}". Analyze the code and return a JSON object with this exact structure:

{
  "language": "string",
  "framework": "string",
  "producesEvents": [{"name": "string", "topic": "string", "schema": {}}],
  "consumesEvents": [{"name": "string", "topic": "string", "schema": {}}],
  "exposesApis": [{"method": "string", "path": "string", "description": "string"}],
  "consumesApis": [{"service": "string", "method": "string", "path": "string"}],
  "databases": [{"type": "string", "name": "string"}],
  "kafkaTopics": ["string"],
  "healthEndpoint": "string or null",
  "summary": "Brief description of what this service does"
}

Files:
---
${filesBlob}
---`;

  const raw = await callOpenRouter(
    prompt,
    'You are an expert software architect. Always respond with valid JSON only, no markdown fences.'
  );
  return safeParseJson<AIAnalysisResult>(raw);
}

export async function discoverRegressionFlows(
  architectureName: string,
  services: Array<{ name: string; summary: string | null; produces: unknown; consumes: unknown; apis: unknown }>
): Promise<RegressionFlow[]> {
  const svcBlob = JSON.stringify(services, null, 2).slice(0, 30000);

  const prompt = `Given this microservice architecture "${architectureName}", identify 3-5 critical end-to-end flows to regression test. For each flow, return ordered steps.

Services:
${svcBlob}

Return JSON:
{"flows": [
  {
    "id": "string",
    "name": "string (e.g., 'Order placement flow')",
    "description": "string",
    "steps": [
      {"serviceName": "string", "type": "api_call|event_produce|event_consume|db_write|db_read|health_check", "name": "string", "description": "string"}
    ]
  }
]}`;

  const raw = await callOpenRouter(
    prompt,
    'You are an expert in distributed systems testing. Return valid JSON only.'
  );
  const parsed = safeParseJson<{ flows: RegressionFlow[] }>(raw);
  return parsed.flows || [];
}

export async function summarizeRegressionRun(runData: {
  architecture: string;
  total: number;
  passed: number;
  failed: number;
  failures: Array<{ step: string; service: string; error: string }>;
}): Promise<{ summary: string; recommendations: string[] }> {
  const prompt = `A regression run on "${runData.architecture}" completed: ${runData.passed}/${runData.total} passed, ${runData.failed} failed.

Failures:
${JSON.stringify(runData.failures, null, 2)}

Return JSON: {"summary": "one paragraph explaining what happened", "recommendations": ["string"]}`;

  const raw = await callOpenRouter(prompt, 'You write concise engineering summaries. Return JSON only.');
  return safeParseJson(raw);
}
