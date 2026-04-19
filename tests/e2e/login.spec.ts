import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('demo user can sign in and lands on the dashboard', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

    // Demo credentials are pre-filled by the form — just submit.
    const email = page.getByLabel(/email/i);
    const password = page.getByLabel(/password/i);
    await expect(email).toHaveValue('demo@servicelens.com');
    await expect(password).toHaveValue('demo123');

    await page.getByRole('button', { name: /^sign in$/i }).click();

    await page.waitForURL(/\/dashboard\/?$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    // Sidebar is the anchor point shared across all dashboard pages.
    await expect(page.getByRole('link', { name: /architectures/i }).first()).toBeVisible();
  });

  test('invalid credentials show an error and stay on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nobody@example.com');
    await page.getByLabel(/password/i).fill('wrong-password');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    // Sonner toast with the error copy.
    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
