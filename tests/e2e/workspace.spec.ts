import { test, expect } from '@playwright/test';
import { loginAsDemo, openSeededArchitecture } from './_helpers';

test.describe('Architecture workspace', () => {
  test('home is the live topology with incidents and activity alongside', async ({ page }) => {
    await loginAsDemo(page);
    await openSeededArchitecture(page);

    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => page.locator('.react-flow__node').count(), { timeout: 15_000 }).toBeGreaterThan(3);
    await expect(page.getByRole('heading', { name: /open incidents/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^activity/i })).toBeVisible();
  });

  test('clicking a service opens its drawer; Escape closes it', async ({ page }) => {
    await loginAsDemo(page);
    await openSeededArchitecture(page);
    await page.locator('.react-flow__node').filter({ hasText: /api gateway/i }).first().click();

    const drawer = page.getByRole('complementary', { name: /service details/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/uptime \(24h\)/i)).toBeVisible();
    await expect(drawer.getByRole('link', { name: /open service page/i })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('search jumps to a service', async ({ page }) => {
    await loginAsDemo(page);
    await openSeededArchitecture(page);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });
    const search = page.getByRole('textbox', { name: /find a service/i });
    await search.fill('payment');
    await search.press('Enter');
    const drawer = page.getByRole('complementary', { name: /service details/i });
    await expect(drawer.getByRole('heading', { name: /payment service/i })).toBeVisible({ timeout: 15_000 });
  });

  test('the old /topology URL redirects to the workspace', async ({ page }) => {
    await loginAsDemo(page);
    const archId = await openSeededArchitecture(page);
    await page.goto(`/architectures/${archId}/topology`);
    await page.waitForURL(new RegExp(`/architectures/${archId}$`), { timeout: 15_000 });
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });
  });
});
