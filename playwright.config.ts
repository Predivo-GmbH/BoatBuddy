import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // PINNED OFF test-results/ ITSELF, DELIBERATELY. The reporter above sweeps outputDir whole at
  // onEnd, and test-results/ in this fleet also holds json reports that CI steps read after the
  // suite and screenshots specs write themselves. Nesting keeps the sweep unconditional and
  // still confined to what Playwright wrote.
  outputDir: 'test-results/artifacts',
  // THE STRIPPER RUNS FIRST, AND THAT ORDER IS LOAD-BEARING. Reporters are called in array
  // order and share one TestResult, so removing an attachment here is what the reporter after
  // it sees - and the base reporter prints `Error Context: <path>` straight out of that array.
  // Registering it after would delete the file and still publish its path into the job log.
  // Playwright writes that error context - an ARIA snapshot of the signed-in page, form-field
  // contents included - for any test that ends with errors, gated on nothing but
  // `errors.length > 0`; no `use:` switch reaches it, and a FLAKY test is enough. See
  // e2e/strip-runner-artifacts.reporter.ts for the whole reasoning.
  reporter: [['./e2e/strip-runner-artifacts.reporter.ts'], [process.env.CI ? 'dot' : 'list']],
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'https://boatbuddy.predivo.ch',
    headless: true,
    // NOTHING IS RECORDED BY THIS SUITE (2026-09-14). It signs a real user in, so a trace records
    // what was typed and a screenshot photographs the form it was typed into. On 2026-09-14 exactly
    // that was found on our SELF-HOSTED runner - one WSL host shared by 19 repositories - holding
    // live staging session tokens, and 104 such files were swept off it. The fleet rule is that a
    // secret is never rendered anywhere, and a debugging convenience is not an exception to it.
    // Debug by reading the assertion, or locally with a throwaway account - never by turning these
    // back on in CI.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
