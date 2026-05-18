import { test, expect } from '@playwright/test';
import { loginAsDemo, openSeededArchitecture } from './_helpers';

test.describe('Topology view', () => {
  test('seeded architecture renders a React Flow topology with service nodes', async ({ page }) => {
    await loginAsDemo(page);
    const archId = await openSeededArchitecture(page);
    await page.goto(`/architectures/${archId}/topology`);

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
