import { defineConfig } from '@playwright/test'

// v11 hardened audit gates (Gates A/B/J/I/K/M) against the deployed staging site.
// Heavier than the deploy-gauntlet smoke: seeds/cleans DB rows and storage objects, so it
// needs BB_MGMT_TOKEN (Management API) + BB_SVC_KEY (staging service key). Run by
// staging-gates.yml (post-deploy + weekly), NOT part of the prod-promotion gauntlet.
// Run locally with:
//   STAGING_HTPASSWD_USER=staging STAGING_HTPASSWD_PASS=<see docs/Credentials.txt> \
//   BB_MGMT_TOKEN=sbp_... BB_SVC_KEY=sb_secret_... \
//   npx playwright test --config playwright.v11-gates.config.ts
const STAGING_URL = process.env.STAGING_URL ?? 'https://staging.boatbuddy.predivo.ch'

export default defineConfig({
  testDir: './e2e/staging',
  testMatch: 'v11-gates.spec.ts',
  timeout: 240_000,
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
