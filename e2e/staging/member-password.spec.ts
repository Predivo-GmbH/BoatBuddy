import { test, expect } from '@playwright/test'
// The helper is Node-only. No service credentials cross into the page.
// @ts-expect-error Node .mjs fixture helper has no declaration file
import { exchangeSharedPassword, stagingKeys, STAGING_API, STAGING_REF } from '../../scripts/lib/staging-member.mjs'

// THE REAL SIGN-IN, END TO END (2026-11-04, review of PR #38). Every other staging test
// signs in with an admin-minted fixture session, so none of them would notice a broken
// password exchange: wrong hash secret, unprovisioned member identity, a function that
// answers 503. These two post the REAL shared password to the deployed member-session
// function and use the session it returns.
//
// The password comes from the MEMBER_GATE_PASSWORD Actions secret and is never printed:
// no fill() (its step title would carry the value into the report), trace and video off,
// no assertion message contains it, GitHub masks the secret in logs on top.
const PASSWORD = process.env.MEMBER_GATE_PASSWORD ?? ''
test.use({ trace: 'off', video: 'off' })

test.describe('real shared-password sign-in on staging', () => {
  test.skip(!PASSWORD && !process.env.CI, 'set MEMBER_GATE_PASSWORD to run this locally')
  test.beforeAll(() => {
    // In CI a missing secret is a failure, not a skip: a skipped gate reads green.
    if (!PASSWORD) throw new Error('MEMBER_GATE_PASSWORD secret is not set; the real member sign-in is untested')
  })

  test('the shared password returns a member session that reads boat data; a wrong one gets 401', async () => {
    const { status, body } = await exchangeSharedPassword(PASSWORD)
    expect(status, 'member-session answer for the real password').toBe(200)
    expect(body.token_type).toBe('bearer')
    expect(body.expires_in).toBeGreaterThan(0)
    expect(body.expires_in).toBeLessThanOrEqual(900)
    const { publicKey } = stagingKeys()
    const headers = { apikey: publicKey, Authorization: `Bearer ${body.access_token}` }
    const user = await fetch(`${STAGING_API}/auth/v1/user`, { headers })
    expect(user.status).toBe(200)
    expect((await user.json()).app_metadata?.boatbuddy_member).toBe(true)
    const boat = await fetch(`${STAGING_API}/rest/v1/boot_stats?select=id`, { headers })
    expect(boat.status).toBe(200)
    expect(await boat.json()).toHaveLength(1)

    const wrong = await exchangeSharedPassword(`not-the-password-${crypto.randomUUID()}`)
    expect(wrong.status, 'a wrong password is refused as wrong, not as unavailable').toBe(401)
  })

  test('typing the shared password on the gate opens the dashboard with that session', async ({ page }) => {
    await page.goto('/dashboard')
    const input = page.getByLabel('Passwort')
    await expect(input).toBeVisible()
    await input.evaluate((element, value) => {
      const field = element as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }, PASSWORD)
    const exchange = page.waitForResponse(response => response.url().endsWith('/functions/v1/member-session'))
    await page.getByRole('button', { name: 'Weiter' }).click()
    expect((await exchange).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 15_000 })
    const member = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? 'null')?.user?.app_metadata?.boatbuddy_member, `sb-${STAGING_REF}-auth-token`)
    expect(member).toBe(true)
  })
})
