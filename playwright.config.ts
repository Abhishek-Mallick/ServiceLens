import { generateKeyPairSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const FAKES = 'http://127.0.0.1:57002';

// The app under test talks only to local fakes (tests/e2e/fakes/server.cjs):
// GitHub, the GitHub App and the LLM point at :57002, and email/Slack/real
// tokens are blanked so nothing leaves the machine. Next.js never lets .env
// override variables that are already set, even to an empty string.
const appKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).privateKey;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node tests/e2e/fakes/server.cjs',
          url: `${FAKES}/admin/ping`,
          reuseExistingServer: !process.env.CI,
          timeout: 20_000,
        },
        {
          // Use npx so the `next` binary resolves through ./node_modules/.bin
          // even when Playwright spawns a fresh shell without our PATH.
          command: `npx next dev -p ${PORT}`,
          port: PORT,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            NEXTAUTH_URL: BASE_URL,
            NEXT_PUBLIC_APP_URL: BASE_URL,
            SCHEDULER_INTERVAL: '5',
            ALLOW_PRIVATE_PROBES: '1', // the monitored fake service runs on 127.0.0.1
            GITHUB_API_URL: FAKES,
            GITHUB_APP_ID: '123',
            GITHUB_APP_PRIVATE_KEY: appKey,
            GITHUB_TOKEN: '',
            WORKERS_AI_BASE_URL: `${FAKES}/v1`,
            WORKERS_AI_CREDENTIALS: 'e2e-account::e2e-fake-token',
            WORKERS_AI_MODEL: '@cf/e2e/fake',
            RESEND_API_KEY: '',
          },
        },
      ],
});
