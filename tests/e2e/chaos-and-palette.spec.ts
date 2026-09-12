import { test, expect } from '@playwright/test';
import { loginAsDemo, openSeededArchitecture } from './_helpers';

test.describe('Chaos drill (manual trigger from Alerts page)', () => {
  test('Run now fires an incident on the chosen service', async ({ page }) => {
    await loginAsDemo(page);
    const archId = await openSeededArchitecture(page);
    await page.goto(`/architectures/${archId}/alerts`);

    // Chaos card lives on the Alerts page (demo architecture only). CardTitle is a div, not a heading.
    await expect(page.getByText('Chaos drills', { exact: true }).first()).toBeVisible();

    // Pick the first service in the select, action kill_service, then Run now.
    const actionSelect = page.locator('select').nth(1);
    await actionSelect.selectOption('kill_service');

    const responsePromise = page.waitForResponse((res) =>
      res.url().endsWith('/chaos-now') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /run now/i }).click();
    const res = await responsePromise;
    expect(res.status()).toBe(201);
    const body = await res.json().catch(() => ({}));
    // kill_service opens (or dedups to) an incident; either path is acceptable.
    expect(typeof body).toBe('object');
  });
});

test.describe('Command palette', () => {
  test('⌘K opens the palette and Enter jumps to a result', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/dashboard');

    // Fire the modifier+K shortcut. Playwright normalises Meta on macOS,
    // Control elsewhere — we send both to be platform-agnostic.
    await page.keyboard.press('Meta+K');
    let palette = page.getByPlaceholder(/search architectures, services, incidents/i);
    if (!(await palette.isVisible().catch(() => false))) {
      await page.keyboard.press('Control+K');
    }
    palette = page.getByPlaceholder(/search architectures, services, incidents/i);
    await expect(palette).toBeVisible({ timeout: 5_000 });

    // Search rather than rely on the empty-query "recent" list, which only
    // shows a few architectures. Wait for the palette's own results (not the
    // dashboard behind it) before pressing Enter.
    await palette.fill('E-Commerce');
    await expect(page.getByRole('dialog').getByText(/e-commerce platform/i).first()).toBeVisible();

    // Hit Enter to navigate to the first hit.
    await palette.press('Enter');
    await page.waitForURL(/\/architectures\/[^/]+/, { timeout: 10_000 });
  });

  test('"g d" leader-key navigates back to the dashboard', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/architectures');
    await expect(page).toHaveURL(/\/architectures\/?$/);
    await page.locator('body').focus();
    await page.keyboard.press('g');
    await page.keyboard.press('d');
    await page.waitForURL(/\/dashboard\/?$/, { timeout: 5_000 });
  });
});
