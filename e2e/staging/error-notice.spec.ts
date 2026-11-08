import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error Node .mjs fixture helper has no declaration file
import { stagingKeys, STAGING_API } from '../../scripts/lib/staging-member.mjs'
// @ts-expect-error Node .mjs fixture helper has no declaration file
import { MEMBER_ID } from '../../scripts/lib/provision-member.mjs'
import { signInMember } from '../member-session'

// THE CUSTOMER ERROR NOTICE ON THE DEPLOYED STAGING SITE (Roger 08.11.2026; contract
// C:/Business/Audits/CONTRACT-customer-error-message-2026-11-08.md, release step "prove on staging":
// planted error -> notice + reference shown, row stored).
//
// The error is PLANTED in this browser only (page.route answers one request with a 500/503), so no
// data changes and no real person is involved. The report itself goes to the REAL deployed
// report-client-error function, and the row it stored is then read back with the staging service key:
// the reference on screen must be a row in client_error_reports.
// Words only: report-client-error removes long runs that mix letters and digits (ids, keys) from
// the stored message, and a file path such as this spec's own would be one of them.
const PLANTED = 'planted by the staging error notice test'

async function storedRow(reference: string) {
  const { serverKey } = stagingKeys()
  if (!serverKey) throw new Error('BB_SVC_KEY (staging service key) is required to read the stored report')
  const admin = createClient(STAGING_API, serverKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.from('client_error_reports')
    .select('reference,area,screen,action,status,message,user_id').eq('reference', reference).maybeSingle()
  if (error) throw new Error(`client_error_reports could not be read (${error.code})`)
  return data
}

async function referenceShown(page: Page, scope: ReturnType<Page['locator']>) {
  await expect(scope).toContainText('Unser Team wurde automatisch benachrichtigt und kümmert sich darum.', { timeout: 20_000 })
  const text = (await scope.textContent()) ?? ''
  const reference = /Referenz: (E-[A-Z2-9]{6})/.exec(text)?.[1]
  expect(reference, `no reference in: ${text}`).toBeTruthy()
  await expect(page.locator('body')).not.toContainText('non-2xx')
  await expect(page.locator('body')).not.toContainText(PLANTED)
  return reference!
}

test.describe('Staging — the customer error notice', () => {
  test('a failed sign-in (planted 503) is reported and its reference is a stored row', async ({ page }) => {
    await page.route('**/functions/v1/member-session', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: PLANTED }) })
      : route.continue())
    const report = page.waitForResponse(r => r.url().endsWith('/functions/v1/report-client-error') && r.request().method() === 'POST')
    await page.goto('/dashboard')
    // Never a real password: the planted answer stops the request before it leaves the browser.
    await page.getByLabel('Passwort').fill('planted-error-not-a-password')
    await page.getByRole('button', { name: 'Weiter' }).click()
    expect((await report).status()).toBe(200)
    const reference = await referenceShown(page, page.getByRole('alert'))
    const row = await storedRow(reference)
    expect(row).toMatchObject({ reference, area: 'signin', screen: 'anmeldung', action: 'memberSession', status: 503, user_id: null })
    expect(row?.message).toContain(PLANTED)
    // The release evidence: the reference a person would have seen, and that it is a stored row.
    console.log(`staging error notice: sign-in reference ${reference} shown and stored (area=signin)`)
  })

  test('a failed load on a member screen (planted 500) is reported with the member id', async ({ page }) => {
    await signInMember(page)
    await page.route('**/rest/v1/boot_stats*', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: PLANTED }) }))
    const report = page.waitForResponse(r => r.url().endsWith('/functions/v1/report-client-error') && r.request().method() === 'POST', { timeout: 30_000 })
    await page.goto('/nutzung')
    expect((await report).status()).toBe(200)
    const reference = await referenceShown(page, page.locator('[data-server-error="notified"]'))
    const row = await storedRow(reference)
    expect(row).toMatchObject({ reference, area: 'other', screen: 'nutzung', action: 'daten-laden', user_id: MEMBER_ID })
    console.log(`staging error notice: member-screen reference ${reference} shown and stored (area=other)`)
  })
})
