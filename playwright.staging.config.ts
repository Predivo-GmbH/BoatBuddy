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
  //
  // gate-a-crawl.spec.ts is excluded for the same reason, and it was the omission that made
  // BoatBuddy unpromotable on 2026-09-03. It is not a test with a duration; it is an
  // exploratory crawl that drives every trigger on every route at several viewport widths and
  // descends into whatever state it uncovers, so its runtime scales with how much data staging
  // happens to hold. It sets its own `test.setTimeout(1_800_000)` — thirty minutes — which
  // overrides the 30s `timeout` below, and staging-gates.yml runs it deliberately in a job
  // budgeted at 40 minutes (measured 7.8 min/run on 2026-08-24, 17m35s on 2026-09-03).
  // Nothing excluded it here, so `gate-e2e` in deploy.yml — budgeted at 20 minutes, because
  // this file is supposed to be the fast smoke run — was running that crawl too. It fitted
  // while it was short; once staging grew (/boot alone now yields 80 triggers) it crossed the
  // job budget and the production deploy could never be reached. Run 33726492534: the crawl
  // was still sweeping /neuigkeiten when the job was killed at 20m27s, deploy skipped.
  // Gate A is NOT weakened by this: it still runs daily and on demand in staging-gates.yml,
  // green there in run 33724901564 the same morning. It simply stops sitting in the promotion
  // path, which is where it was never meant to be.
  testIgnore: ['**/v11-gates.spec.ts', '**/gate-a-crawl.spec.ts'],
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
