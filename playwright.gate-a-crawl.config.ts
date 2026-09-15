import { defineConfig, devices } from '@playwright/test'

/**
 * Gate A runtime crawl against the DEPLOYED staging site.
 *
 * Kept in its OWN config, separate from playwright.v11-gates.config.ts: the crawl is
 * long-running and READ-ONLY by design (it measures the commit control in every dialog it
 * finds and never clicks one, and never clicks anything on the denylists in the spec).
 * Isolating it means a slow or noisy crawl can never delay the write-gates, and vice versa.
 *
 * staging.boatbuddy.predivo.ch sits behind HTTP basic auth. WITHOUT httpCredentials every
 * route returns a 401 page and the crawl reports zero triggers, which reads exactly like a
 * clean app. That is not hypothetical: ChannelMover's recon did precisely that on
 * 2026-08-20 before its credentials were wired in.
 *
 * Run locally:
 *   STAGING_HTPASSWD_USER=staging STAGING_HTPASSWD_PASS=<see docs/Credentials.txt> \
 *   npx playwright test --config playwright.gate-a-crawl.config.ts
 */
const STAGING_URL = process.env.STAGING_URL ?? 'https://staging.boatbuddy.predivo.ch'

export default defineConfig({
  testDir: './e2e/staging',
  // PINNED OFF test-results/ ITSELF, DELIBERATELY. The reporter above sweeps outputDir whole at
  // onEnd, and test-results/ in this fleet also holds json reports that CI steps read after the
  // suite and screenshots specs write themselves. Nesting keeps the sweep unconditional and
  // still confined to what Playwright wrote.
  outputDir: 'test-results/artifacts',
  testMatch: 'gate-a-crawl.spec.ts',
  timeout: 1_800_000,
  retries: 0, // a retry would double a long crawl and hide flakiness rather than surface it
  workers: 1,
  // THE STRIPPER RUNS FIRST, AND THAT ORDER IS LOAD-BEARING. Reporters are called in array
  // order and share one TestResult, so removing an attachment here is what the reporter after
  // it sees - and the base reporter prints `Error Context: <path>` straight out of that array.
  // Registering it after would delete the file and still publish its path into the job log.
  // Playwright writes that error context - an ARIA snapshot of the signed-in page, form-field
  // contents included - for any test that ends with errors, gated on nothing but
  // `errors.length > 0`; no `use:` switch reaches it, and a FLAKY test is enough. See
  // e2e/strip-runner-artifacts.reporter.ts for the whole reasoning.
  reporter: [['./e2e/strip-runner-artifacts.reporter.ts'], ['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: STAGING_URL,
    headless: true,
    // NOTHING IS RECORDED WHEN THIS SUITE FAILS (2026-09-15). A trace records what was typed
    // and a screenshot photographs the form it was typed into, and both are written to a
    // SELF-HOSTED runner that 19 repositories share and then uploaded as a CI artifact. The
    // fleet rule is that a secret is never rendered anywhere, and a debugging convenience is
    // not an exception to it. Debug by reading the assertion, or locally with a throwaway
    // account - never by turning these back on in CI.
    //
    // THESE THREE SWITCHES DO NOT CLOSE THE FOURTH CHANNEL. Playwright writes
    // test-results/<test>/error-context.md - an ARIA snapshot of the page, i.e. the signed-in
    // application including the contents of form fields - for any test that ends with errors,
    // gated on nothing but `errors.length > 0`. There is no `use:` option for it. It is removed
    // by the reporter registered above; drop that and this suite starts leaving photographs of
    // a signed-in page on a runner 19 repositories share.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    // Playwright's default actionTimeout is 0, so an action inherits the (deliberately
    // huge) test timeout. A locator pointing at a responsive surface that unmounted at a
    // wider viewport then blocks for the whole run and the job looks slow, not stuck.
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    httpCredentials:
      process.env.STAGING_HTPASSWD_USER && process.env.STAGING_HTPASSWD_PASS
        ? { username: process.env.STAGING_HTPASSWD_USER, password: process.env.STAGING_HTPASSWD_PASS }
        : undefined,
  },
  projects: [{ name: 'gate-a-crawl', use: { browserName: 'chromium' } }],
})
