import { test, expect, type Page } from '@playwright/test';
import { hasSession, passwordField, signInWithForm } from './_helpers';

// The v1 golden path on a real (non-demo) architecture, end to end:
// sign up → onboard a repo + deployed URL → dependencies read from code →
// health checks with no browser driving them → on-call sheet → the service
// breaks → incident → on-call paged → RCA → draft fix PR (auto mode) →
// the service recovers → auto-resolve → runbook summary.
//
// GitHub, the GitHub App, the LLM and the monitored service are local fakes
// (tests/e2e/fakes/server.cjs, wired up in playwright.config.ts). It writes a
// new user and architecture, so it only runs in CI or with E2E_GOLDEN=1
// against a scratch database.

const SERVICE = 'http://127.0.0.1:57001';
const FAKES = 'http://127.0.0.1:57002';

test.skip(!process.env.CI && process.env.E2E_GOLDEN !== '1', 'writes data: runs in CI, or locally with E2E_GOLDEN=1 on a scratch DB');

interface Ws {
  services: Array<{ id: string; name: string; healthStatus: string; commitSha: string | null; openIncident: { id: string } | null }>;
  incidents: Array<{ id: string; title: string; status: string; oncall: { name: string } | null; fixPr: { url: string | null } | null }>;
  graph: { nodes: unknown[] };
}

async function workspace(page: Page, archId: string): Promise<Ws> {
  const res = await page.request.get(`/api/architectures/${archId}/workspace`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test('golden path: outage → page → RCA → draft fix PR → auto-resolve → runbook', async ({ page }) => {
  test.setTimeout(300_000);
  const run = Date.now().toString(36);
  const repo = `acme/orders-${run}`;
  await fetch(`${SERVICE}/up`);

  // 1. Sign up. The page signs the new user in; if that sign-in doesn't take
  //    (cold dev-server compile), it sends them to /login — sign in there.
  const email = `golden-${run}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('Golden Path');
  await page.getByLabel('Email').fill(email);
  await passwordField(page).fill('golden-pass-1');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/(dashboard|login)\/?(\?.*)?$/, { timeout: 30_000 });
  if (!(await hasSession(page))) await signInWithForm(page, email, 'golden-pass-1');
  await page.goto('/dashboard');
  await expect(page.getByTestId('onboarding-callout')).toBeVisible({ timeout: 20_000 });

  // 2. Onboard one service: repo + deployed URL, analyzed on create
  await page.goto('/architectures/new');
  await page.getByLabel('Name', { exact: true }).fill(`Golden ${run}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('GitHub repo').fill(`https://github.com/${repo}`);
  await page.getByLabel('Service name').fill('orders');
  await page.getByLabel('Deployed URL').fill(SERVICE);
  await page.getByRole('button', { name: /create & analyze 1 service/i }).click();
  // The wizard lives at /architectures/new, so wait for a real id.
  await page.waitForURL(/\/architectures\/(?!new(?:[/?#]|$))[^/?#]+$/, { timeout: 90_000 });
  const archId = new URL(page.url()).pathname.split('/').pop()!;

  // 3. The workspace shows the service, analyzed from the repo at a pinned commit
  await expect(page.locator('.react-flow__node').filter({ hasText: 'orders' })).toBeVisible({ timeout: 20_000 });
  let ws = await workspace(page, archId);
  const svc = ws.services.find((s) => s.name === 'orders')!;
  expect(svc.commitSha).toBeTruthy();

  // 4. Faster probe for the test, on-call sheet, auto fix PRs on
  const probes = (await (await page.request.get(`/api/services/${svc.id}/probes`)).json()).probes as Array<{ id: string; target: string }>;
  expect(probes.length).toBeGreaterThan(0);
  expect((await page.request.patch(`/api/probes/${probes[0].id}`, { data: { intervalSec: 5 } })).ok()).toBeTruthy();
  expect((await page.request.put(`/api/architectures/${archId}/oncall`, { data: { csvUrl: `${SERVICE}/roster.csv` } })).ok()).toBeTruthy();
  expect((await page.request.patch(`/api/architectures/${archId}/settings`, { data: { autoFixPr: true } })).ok()).toBeTruthy();

  // 5. Health checks run server-side: the service turns healthy with no one clicking
  await expect.poll(async () => (await workspace(page, archId)).services[0].healthStatus, { timeout: 60_000, intervals: [2_000] }).toBe('healthy');

  // 6. Break it → the "Service down" rule opens an incident
  await fetch(`${SERVICE}/down`);
  await expect.poll(async () => (await workspace(page, archId)).incidents.length, { timeout: 120_000, intervals: [3_000] }).toBeGreaterThan(0);

  // 7. On-call paged from the sheet, and auto mode opens a draft PR once the RCA exists
  await expect.poll(async () => (await workspace(page, archId)).incidents[0].fixPr?.url ?? null, { timeout: 120_000, intervals: [3_000] }).toMatch(/\/pull\/1$/);
  ws = await workspace(page, archId);
  const incident = ws.incidents[0];
  expect(incident.oncall?.name).toBe('Acme SRE');

  const gh = await (await fetch(`${FAKES}/admin/log?repo=${encodeURIComponent(repo)}`)).json();
  expect(gh.pulls['1'].draft).toBe(true);
  expect(gh.pulls['1'].head.ref).toMatch(/^servicelens\//);
  expect(gh.writes.map((w: { path: string }) => w.path)).toEqual(['/git/blobs', '/git/trees', '/git/commits', '/git/refs', '/pulls']);

  // 8. The incident page: RCA ready, on-call shown, PR linked
  await page.goto(`/architectures/${archId}/incidents/${incident.id}`);
  await expect(page.getByText('Likely root cause')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Acme SRE').first()).toBeVisible();
  await expect(page.locator(`a[href="https://github.com/${repo}/pull/1"]`).first()).toBeVisible();

  // 9. Recover → auto-resolve → a facts-only runbook summary is recorded
  await fetch(`${SERVICE}/up`);
  await expect
    .poll(async () => {
      await page.reload();
      return page.getByTestId('resolution-summary').count();
    }, { timeout: 150_000, intervals: [5_000] })
    .toBe(1);
  const summary = await page.getByTestId('resolution-summary').innerText();
  expect(summary).toMatch(/^Recovered after .+ auto-resolved it\./);
  expect(summary).toContain('Likely cause (RCA): Calls from orders to PAYMENTS_SERVICE_URL time out');
  expect(summary).toContain(`PR #1 "fix(orders): raise payments client timeout to 3s" (open) https://github.com/${repo}/pull/1`);
});
