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

  test('staging Supabase is reachable (GraphQL health)', async ({ request }) => {
    const url = process.env.STAGING_SUPABASE_URL ?? 'https://svpewgbwousyheohlrtt.supabase.co'
    const key = process.env.STAGING_SUPABASE_ANON_KEY
    test.skip(!key, 'STAGING_SUPABASE_ANON_KEY not set')
    const res = await request.post(`${url}/graphql/v1`, {
      headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      data: { query: '{ __typename }' },
    })
    expect(res.ok()).toBeTruthy()
  })
})
