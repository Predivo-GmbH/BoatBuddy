import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  reporter: process.env.CI ? [['./e2e/strip-runner-artifacts.reporter.ts'], ['list']] : undefined,
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
