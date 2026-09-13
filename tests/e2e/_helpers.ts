import { expect, type Page } from '@playwright/test';

// True once the browser context holds a real NextAuth session. Waiting on this
// (not on the /dashboard URL) matters on a cold `next dev`: the client can
// reach /dashboard before the session cookie is usable, and the next
// protected page then bounces to /login.
export async function hasSession(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/auth/session');
  const body = await res.json().catch(() => null);
  return !!body?.user;
}

// Signs in through the credentials form and returns once the session is real.
// One retry covers the credentials route still compiling on the first POST.
export async function signInWithForm(page: Page, email: string, password: string) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    const ok = await expect
      .poll(() => hasSession(page), { timeout: 30_000, intervals: [500, 1_000, 2_000] })
      .toBe(true)
      .then(() => true, () => false);
    if (ok) {
      await page.goto('/dashboard');
      await page.waitForURL(/\/dashboard\/?$/, { timeout: 30_000 });
      return;
    }
  }
  throw new Error(`sign-in for ${email} never produced a session`);
}

// Logs the demo user in. Reused by every suite so the auth dance stays in one place.
export async function loginAsDemo(page: Page) {
  await signInWithForm(page, 'demo@servicelens.com', 'demo123');
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
