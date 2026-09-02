import { defineConfig } from '@playwright/test'

// Staging E2E — runs against the deployed staging site (https://staging.boatbuddy.predivo.ch),
// which sits behind HTTP Basic auth (.htpasswd). Credentials come from CI env so they are
// never committed. Run locally with:
//   STAGING_URL=https://staging.boatbuddy.predivo.ch \
//   STAGING_HTPASSWD_USER=staging STAGING_HTPASSWD_PASS=<see docs/Credentials.txt> \
//   npm run test:e2e:staging
const STAGING_URL = process.env.STAGING_URL ?? 'https://staging.boatbuddy.predivo.ch'

export default defineConfig({
  testDir: './e2e/staging',
  // The v11 hardened gates are a heavier suite (DB seeding, storage teardown) needing the
  // Management token + service key. They run in their OWN workflow (staging-gates.yml via
  // playwright.v11-gates.config.ts) and are kept OUT of this deploy-gauntlet smoke run so
  // prod promotion stays fast and does not require those secrets.
  testIgnore: '**/v11-gates.spec.ts',
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
