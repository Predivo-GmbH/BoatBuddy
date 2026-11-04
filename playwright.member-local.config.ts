import { defineConfig, devices } from '@playwright/test'

// Entirely offline app/backend contract test. No staging/production credentials,
// host requests, email, AI calls, database writes or saved real sessions.
export default defineConfig({
  testDir: './e2e/local', timeout: 60_000, expect: { timeout: 15_000 }, workers: 1, retries: 0,
  outputDir: 'test-results/member-local',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'off', video: 'off', screenshot: 'off' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178', reuseExistingServer: false, timeout: 120_000,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:59999', VITE_SUPABASE_ANON_KEY: 'offline-public-fixture' },
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
})
