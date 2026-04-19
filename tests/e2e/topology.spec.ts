import { test, expect } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard\/?$/, { timeout: 15_000 });
}

test.describe('Topology view', () => {
  test('seeded architecture renders a React Flow topology with service nodes', async ({ page }) => {
    await signIn(page);
    await page.goto('/architectures');

    // Click into the seeded architecture.
    await page.getByText(/e-commerce platform/i).first().click();
    await page.waitForURL(/\/architectures\/[\w-]+$/, { timeout: 15_000 });

    // Navigate to the Topology tab.
    await page.getByRole('link', { name: /^topology$/i }).click();
    await page.waitForURL(/\/architectures\/[\w-]+\/topology$/, { timeout: 15_000 });

    // React Flow mounts a container with class `react-flow`; nodes carry data-id.
    const flow = page.locator('.react-flow');
    await expect(flow).toBeVisible({ timeout: 15_000 });

    // Seed creates 10 services, so we expect at least a handful of nodes (services + brokers + dbs).
    const nodes = page.locator('.react-flow__node');
    await expect.poll(async () => nodes.count(), { timeout: 15_000 }).toBeGreaterThan(3);

    // At least one service node should be labeled with one of the seeded service names.
    await expect(page.getByText(/api gateway/i).first()).toBeVisible();
  });
});
