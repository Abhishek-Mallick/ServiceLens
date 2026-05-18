import { test, expect } from '@playwright/test';
import { loginAsDemo } from './_helpers';

test.describe('Architectures', () => {
  test('seeded architecture appears in the list', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/architectures');
    // Phase 5 redesign: section labels are styled divs, not headings. Anchor
    // on the seeded item directly.
    await expect(page.getByText(/e-commerce platform/i).first()).toBeVisible();
  });

  test('user can create a new architecture via the template wizard', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/architectures/new');

    // Step 1 — name + description (Phase 5.4 wizard).
    const name = `E2E Arch ${Date.now()}`;
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Description').fill('Created from a Playwright E2E test.');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 2 — keep the default Blank template selected.
    await page.getByRole('button', { name: /create architecture/i }).click();
    await page.waitForURL(/\/architectures\/[\w-]+$/, { timeout: 20_000 });
    await expect(page.getByText(name).first()).toBeVisible();
  });
});
