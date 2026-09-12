import { test, expect } from '@playwright/test';
import { loginAsDemo, openSeededArchitecture } from './_helpers';

test.describe('Incident lifecycle', () => {
  test('trigger → RCA streams → fix-PR → ack → resolve', async ({ page }) => {
    await loginAsDemo(page);
    const archId = await openSeededArchitecture(page);

    // Fire a synthetic incident from the architecture header. Phase 1 added
    // the button; Phase 4 wired auto-RCA on the incident page.
    await page.getByRole('button', { name: /trigger incident/i }).click();

    // Toast confirms, then we land on the new incident page.
    await page.waitForURL(/\/architectures\/[^/]+\/incidents\/[^/]+$/, { timeout: 20_000 });
    expect(page.url()).toMatch(new RegExp(`/architectures/${archId}/incidents/`));

    // RCA panel auto-starts streaming. We don't need a fully-formed analysis —
    // the heuristic fallback emits 100+ words within ~5s, so wait for
    // *anything* meaningful in the body.
    const rcaCard = page.locator('text=AI root-cause analysis').locator('..').locator('..').first();
    await expect(rcaCard).toBeVisible();
    await expect(rcaCard.locator('pre, .prose').first()).toContainText(/root cause|evidence|suggested|service/i, { timeout: 60_000 });

    // Fix PRs need a real repository; on the demo mesh the panel explains that
    // instead of inventing a patch. (The real flow is covered against a fake
    // GitHub in the verification runs — see docs/STATUS.md.)
    await page.getByRole('button', { name: /generate fix/i }).click();
    await expect(page.getByText(/demo mesh has no source to fix/i)).toBeVisible({ timeout: 30_000 });

    // Acknowledge.
    await page.getByRole('button', { name: /^acknowledge$/i }).click();
    // Status badge in the header chip should flip; toast appears via Sonner.
    await expect(page.getByText(/acknowledged/i).first()).toBeVisible({ timeout: 10_000 });

    // Resolve with a note — confirms the resolution lands in the timeline.
    const note = `e2e test resolution ${Date.now()}`;
    await page.getByPlaceholder(/resolution notes/i).fill(note);
    await page.getByRole('button', { name: /^resolve$/i }).click();
    await expect(page.getByText(/^resolved$/i).first()).toBeVisible({ timeout: 10_000 });
    // The note appears in the timeline section.
    // Shown in both the timeline and the Details card.
    await expect(page.getByText(note).first()).toBeVisible({ timeout: 5_000 });
  });
});
