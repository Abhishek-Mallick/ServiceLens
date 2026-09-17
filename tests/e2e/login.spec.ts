import { test, expect } from '@playwright/test';
import { passwordField } from './_helpers';

test.describe('Authentication', () => {
  test('demo user can sign in and lands on the dashboard', async ({ page }) => {
    await page.goto('/login');
    // Phase 5 redesign: the auth-card title is a styled div, not a heading.
    // Anchor on the submit button instead — it's always present and accessible.
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();

    // Demo credentials are pre-filled by the form — just submit.
    const email = page.getByLabel(/email/i);
    const password = passwordField(page);
    await expect(email).toHaveValue('demo@servicelens.com');
    await expect(password).toHaveValue('demo123');

    await page.getByRole('button', { name: /^sign in$/i }).click();

    // URL match is the authoritative success signal. The first dashboard
    // compile can take 20s+ on cold start; we don't gate on content here.
    await page.waitForURL(/\/dashboard\/?$/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard\/?$/);
  });

  test('invalid credentials show an error and stay on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nobody@example.com');
    await passwordField(page).fill('wrong-password');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    // Sonner toast with the error copy.
    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
