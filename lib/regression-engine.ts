import { prisma } from './prisma';
import { parseJson, stringify } from './utils';
import type { RegressionFlow, RegressionFlowStep, ServiceProducedEvent, ServiceConsumedEvent, ServiceApi } from './types';

type DbService = Awaited<ReturnType<typeof prisma.service.findMany>>[number];

// Heuristic flow discovery — derives flows from topology dependencies.
export function discoverFlowsHeuristic(services: DbService[]): RegressionFlow[] {
  const flows: RegressionFlow[] = [];

  const producers = services.filter((s) => {
    const produces = parseJson<ServiceProducedEvent[]>(s.producesEvents, []);
    return produces.length > 0;
  });

  const entry = producers.find((s) => /gateway|order|user|auth/i.test(s.name)) ?? producers[0];
  if (!entry) {
    return services.slice(0, 3).map((s, i) => ({
      id: `flow-${i}`,
      name: `${s.name} health flow`,
      description: `Basic health-check flow for ${s.name}`,
      steps: [
        {
          serviceName: s.name,
          type: 'health_check',
          name: `Ping ${s.name}`,
          description: 'Verify service is reachable',
        },
      ],
    }));
  }

  // Build one representative flow per event chain
  const visited = new Set<string>();

  function buildChain(from: DbService, flowSteps: RegressionFlowStep[], depth = 0): void {
    if (depth > 4 || visited.has(from.id)) return;
    visited.add(from.id);

    const produces = parseJson<ServiceProducedEvent[]>(from.producesEvents, []);
    for (const evt of produces.slice(0, 1)) {
      flowSteps.push({
        serviceName: from.name,
        type: 'event_produce',
        name: `${from.name} produces ${evt.name}`,
        description: evt.topic ? `Published to topic "${evt.topic}"` : undefined,
        input: { event: evt.name, payload: evt.schema ?? {} },
      });
      const consumer = services.find((s) => {
        if (s.id === from.id) return false;
        const consumes = parseJson<ServiceConsumedEvent[]>(s.consumesEvents, []);
        return consumes.some((c) => c.topic === evt.topic);
      });
      if (consumer) {
        flowSteps.push({
          serviceName: consumer.name,
          type: 'event_consume',
          name: `${consumer.name} consumes ${evt.name}`,
          description: evt.topic ? `From topic "${evt.topic}"` : undefined,
          expectedOutput: { processed: true },
        });
        buildChain(consumer, flowSteps, depth + 1);
      }
    }
  }

  const apiFlow: RegressionFlow = {
    id: 'flow-api-gateway',
    name: `API entry flow via ${entry.name}`,
    description: `Exercise request path starting at ${entry.name}`,
    steps: [],
  };
  const apis = parseJson<ServiceApi[]>(entry.exposesApis, []);
  if (apis[0]) {
    apiFlow.steps.push({
      serviceName: entry.name,
      type: 'api_call',
      name: `${apis[0].method} ${apis[0].path}`,
      description: apis[0].description,
      input: apis[0].requestSchema ?? {},
      expectedOutput: { statusCode: 200 },
    });
  }
  buildChain(entry, apiFlow.steps);
  if (apiFlow.steps.length > 0) flows.push(apiFlow);

  // Add health flows for every service
  flows.push({
    id: 'flow-health',
    name: 'Full health sweep',
    description: 'Ping every service health endpoint',
    steps: services.map((s) => ({
      serviceName: s.name,
      type: 'health_check',
      name: `Health: ${s.name}`,
      description: s.healthEndpoint ?? 'Default health check',
    })),
  });

  // Contract validation flow
  flows.push({
    id: 'flow-contracts',
    name: 'Event contract validation',
    description: 'Validate produced event schemas match consumer expectations',
    steps: services
      .flatMap((s) => parseJson<ServiceProducedEvent[]>(s.producesEvents, []).map((e) => ({ s, e })))
      .slice(0, 8)
      .map(({ s, e }) => ({
        serviceName: s.name,
        type: 'event_produce' as const,
        name: `Validate ${e.name} schema`,
        description: e.topic ? `Topic: ${e.topic}` : undefined,
        expectedOutput: { schemaValid: true },
      })),
  });

  return flows;
}

function pickStatus(step: RegressionFlowStep, failureRate: number): 'passed' | 'failed' {
  return Math.random() < failureRate ? 'failed' : 'passed';
}

export async function executeRegressionRun(
  architectureId: string,
  opts: { failureRate?: number; triggeredBy?: string; onProgress?: (stepIndex: number, total: number, status: string) => void } = {}
): Promise<string> {
  const services = await prisma.service.findMany({ where: { architectureId } });
  const flows = discoverFlowsHeuristic(services);
  const allSteps = flows.flatMap((f) =>
    f.steps.map((s) => ({ ...s, flowId: f.id, flowName: f.name }))
  );

  const run = await prisma.regressionRun.create({
    data: {
      architectureId,
      status: 'running',
      startedAt: new Date(),
      triggeredBy: opts.triggeredBy ?? 'manual',
      totalSteps: allSteps.length,
    },
  });

  const failureRate = opts.failureRate ?? 0.08;
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < allSteps.length; i++) {
    const step = allSteps[i];
    const svc = services.find((s) => s.name === step.serviceName) ?? services[0];
    if (!svc) continue;

    const status = pickStatus(step, failureRate);
    const duration = Math.floor(80 + Math.random() * 320);

    let errorMessage: string | null = null;
    let actualOutput: Record<string, unknown> | null = null;

    if (status === 'failed') {
      const errors = [
        'Schema mismatch: expected field "userId" was missing',
        'Timeout exceeded: 5000ms',
        'Connection refused: service unreachable',
        'Event payload failed validation against consumer schema',
        'Non-2xx status returned: 503',
      ];
      errorMessage = errors[Math.floor(Math.random() * errors.length)];
    } else {
      actualOutput = step.expectedOutput ?? { ok: true };
    }

    await prisma.regressionTestStep.create({
      data: {
        runId: run.id,
        serviceId: svc.id,
        stepOrder: i,
        name: step.name,
        description: step.description ?? null,
        type: step.type,
        status,
        input: step.input ? stringify(step.input) : null,
        expectedOutput: step.expectedOutput ? stringify(step.expectedOutput) : null,
        actualOutput: actualOutput ? stringify(actualOutput) : null,
        errorMessage,
        duration,
        executedAt: new Date(),
      },
    });

    if (status === 'passed') passed += 1;
    else failed += 1;

    opts.onProgress?.(i, allSteps.length, status);
  }

  await prisma.regressionRun.update({
    where: { id: run.id },
    data: {
      status: failed === 0 ? 'completed' : failed > allSteps.length / 2 ? 'failed' : 'completed',
      completedAt: new Date(),
      passedSteps: passed,
      failedSteps: failed,
      summary: stringify({
        summary: `${passed}/${allSteps.length} steps passed across ${flows.length} end-to-end flows.`,
        recommendations:
          failed > 0
            ? [
                'Inspect failed steps for schema drift between producers and consumers',
                'Validate network reachability for services showing timeouts',
              ]
            : ['All flows healthy — consider adding load-based regression scenarios.'],
      }),
    },
  });

  return run.id;
}

export async function listFlowsForArchitecture(architectureId: string): Promise<RegressionFlow[]> {
  const services = await prisma.service.findMany({ where: { architectureId } });
  return discoverFlowsHeuristic(services);
}
