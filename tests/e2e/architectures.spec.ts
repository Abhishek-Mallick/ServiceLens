import { test, expect } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard\/?$/, { timeout: 15_000 });
}

test.describe('Architectures', () => {
  test('seeded architecture appears in the list', async ({ page }) => {
    await signIn(page);
    await page.goto('/architectures');
    await expect(page.getByRole('heading', { name: /^architectures$/i })).toBeVisible();
    // Seed creates "E-Commerce Platform".
    await expect(page.getByText(/e-commerce platform/i).first()).toBeVisible();
  });

  test('user can create a new architecture and land on its detail page', async ({ page }) => {
    await signIn(page);
    await page.goto('/architectures/new');
    await expect(page.getByRole('heading', { name: /new architecture/i })).toBeVisible();

    const name = `E2E Arch ${Date.now()}`;
    await page.getByLabel(/^name$/i).fill(name);
    await page.getByLabel(/description/i).fill('Created from a Playwright E2E test.');
    await page.getByRole('button', { name: /^create$/i }).click();

    // Router pushes to /architectures/<id> on success.
    await page.waitForURL(/\/architectures\/[\w-]+$/, { timeout: 15_000 });
    await expect(page.getByText(name).first()).toBeVisible();
  });
});
