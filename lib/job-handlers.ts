// Registers every job type's handler with the queue. Idempotent; called by
// the scheduler before each drain so any process that drains can run any job.

import { registerHandler } from './jobs';
import { handleProbeJob, type ProbeJobPayload } from './probes';
import { analyzeArchitecture } from './analyze';
import { handleEscalate, handleIncidentOpened, handleNotify, handleRca } from './incident-pipeline';
import type { IncidentTemplate } from './incidents';
import { handleAutoFixPr } from './remediation';
import { runContractTests } from './contract-tests';
import { summarizeResolution } from './runbook';

let registered = false;

export function registerJobHandlers(): void {
  if (registered) return;
  registered = true;

  registerHandler<ProbeJobPayload, unknown>('probe', ({ payload }) => handleProbeJob(payload));

  registerHandler<{ architectureId: string; serviceIds?: string[] }, unknown>('analyze', ({ payload }) =>
    analyzeArchitecture(payload.architectureId, { serviceIds: payload.serviceIds })
  );

  registerHandler<{ incidentId: string }, unknown>('incident_opened', ({ payload }) => handleIncidentOpened(payload.incidentId));
  registerHandler<{ incidentId: string }, unknown>('escalate', ({ payload }) => handleEscalate(payload.incidentId));
  registerHandler<{ incidentId: string }, unknown>('rca', ({ payload }) => handleRca(payload.incidentId));
  registerHandler<{ incidentId: string }, unknown>('fix_pr', ({ payload }) => handleAutoFixPr(payload.incidentId));
  registerHandler<{ architectureId: string }, unknown>('contract_tests', ({ payload }) =>
    runContractTests(payload.architectureId, { triggeredBy: 'schedule' })
  );
  registerHandler<{ incidentId: string; template: IncidentTemplate }, unknown>('notify', ({ payload }) =>
    handleNotify(payload.incidentId, payload.template)
  );
  registerHandler<{ incidentId: string }, unknown>('resolution_summary', ({ payload }) => summarizeResolution(payload.incidentId));
}
