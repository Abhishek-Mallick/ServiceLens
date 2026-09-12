import { NextResponse } from 'next/server';
import { apiKeyAuth } from '@/lib/api-keys';
import { runContractTests } from '@/lib/contract-tests';
import { record } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Post-deploy gate for CI: call every extracted GET route on the deployed
// services and report. Fail the pipeline when `failed > 0`.
export async function POST(req: Request) {
  const auth = await apiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const result = await runContractTests(auth.architectureId, { triggeredBy: 'api' });
  void record({ action: 'contract_tests.run', architectureId: auth.architectureId, targetType: 'regression_run', targetId: result.runId, payload: { via: 'api_key', keyId: auth.keyId, failed: result.failed } });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return NextResponse.json({ ...result, url: `${base}/architectures/${auth.architectureId}/regression/${result.runId}` }, { status: 201 });
}
