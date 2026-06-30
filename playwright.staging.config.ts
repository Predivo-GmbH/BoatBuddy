import { defineConfig } from '@playwright/test'

// Staging E2E — runs against the deployed staging site (https://staging.boatbuddy.predivo.ch),
// which sits behind HTTP Basic auth (.htpasswd). Credentials come from CI env so they are
// never committed. Run locally with:
//   STAGING_URL=https://staging.boatbuddy.predivo.ch \
//   STAGING_HTPASSWD_USER=staging STAGING_HTPASSWD_PASS=predivo2026 \
//   npm run test:e2e:staging
const STAGING_URL = process.env.STAGING_URL ?? 'https://staging.boatbuddy.predivo.ch'

export default defineConfig({
  testDir: './e2e/staging',
  timeout: 30_000,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: STAGING_URL,
    headless: true,
    screenshot: 'only-on-failure',
    httpCredentials:
      process.env.STAGING_HTPASSWD_USER && process.env.STAGING_HTPASSWD_PASS
        ? { username: process.env.STAGING_HTPASSWD_USER, password: process.env.STAGING_HTPASSWD_PASS }
        : undefined,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
