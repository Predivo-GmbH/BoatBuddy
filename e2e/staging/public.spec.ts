import { test, expect } from '@playwright/test'

// Public (pre-login) checks against the deployed staging site. These catch the things
// a unit test can't: a broken .htaccess (500), a bad build, or a wrong Supabase env var.

test.describe('Staging — public', () => {
  test('PasswordGate blocks access (site is up, not 500)', async ({ page }) => {
    const res = await page.goto('/dashboard')
    expect(res?.status(), 'staging should respond 200 (a 500 = .htaccess error)').toBe(200)
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 })
  })

  test('404 / unknown route still renders the SPA (no server 500)', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist')
    expect(res?.status()).toBeLessThan(500)
    await expect(page.locator('body')).toBeVisible()
  })

  test('no console errors on the gate', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

  // Not the Data API schema root (GET /rest/v1/): since 2026-04-08 Supabase refuses it to
  // every non-secret key on every project ("Access to schema is forbidden",
  // supabase.com/changelog/42949), so that check could never pass (gate-e2e run 41969015343).
  // GraphQL went with migration 033. Auth's health endpoint sits behind the same gateway key
  // check (no key: "No API key found"; a wrong key: "Invalid API key"), so this still catches
  // a wrong key or a project that is down. The Data API itself is covered by
  // member-password.spec.ts, which reads boot_stats with a real member session.
  test('staging Supabase is reachable and accepts the publishable key (Auth health)', async ({ request }) => {
    const url = process.env.STAGING_SUPABASE_URL ?? 'https://svpewgbwousyheohlrtt.supabase.co'
    const key = process.env.STAGING_SUPABASE_ANON_KEY
    test.skip(!key, 'STAGING_SUPABASE_ANON_KEY not set')
    const res = await request.get(`${url}/auth/v1/health`, { headers: { apikey: key! } })
    // The body is the gateway's error or Auth's name and version, never a key.
    expect(res.status(), `Auth health answered ${res.status()}: ${(await res.text()).slice(0, 200)}`).toBe(200)
  })
})
