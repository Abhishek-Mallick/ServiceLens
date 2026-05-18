import type { Page } from '@playwright/test';

// Logs the demo user in via the credentials form. Reused by every suite so
// the auth dance stays in one place and per-test cookies stay fresh.
export async function loginAsDemo(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('demo@servicelens.com');
  await page.getByLabel(/password/i).fill('demo123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  // First dashboard compile can be slow; wait generously for the redirect.
  await page.waitForURL(/\/dashboard\/?$/, { timeout: 30_000 });
}

// Returns the seeded architecture's id by reading it from the dashboard.
// The seed always creates "E-Commerce Platform" so we navigate via its name.
export async function openSeededArchitecture(page: Page): Promise<string> {
  await page.goto('/architectures');
  // The card title is a styled div, not a link — match on the visible text
  // which is wrapped in an outer <a>.
  await page.getByText(/e-commerce platform/i).first().click();
  await page.waitForURL(/\/architectures\/[^/]+$/, { timeout: 20_000 });
  const m = page.url().match(/\/architectures\/([^/?#]+)/);
  if (!m) throw new Error(`couldn't parse arch id from ${page.url()}`);
  return m[1];
}
