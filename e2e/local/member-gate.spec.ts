import { test, expect, type Page } from '@playwright/test'
import { createHash, createHmac } from 'node:crypto'
import { createMemberHandler, SHARED_MEMBER_ID } from '../../supabase/functions/member-session/handler'
import { createPhoneHandler } from '../../supabase/functions/phone-upload/handler'

const password = 'offline-only fixture password'
const qr = '0123456789abcdef0123456789abcdef'
function fixtureSession(offset = 900) {
  const exp = Math.floor(Date.now() / 1000) + offset
  const user = { id: SHARED_MEMBER_ID, aud: 'authenticated', role: 'authenticated', app_metadata: { boatbuddy_member: true }, user_metadata: {} }
  const payload = Buffer.from(JSON.stringify({ ...user, sub: user.id, exp, iat: exp - 900 })).toString('base64url')
  const input = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${payload}`
  const jwt = `${input}.${createHmac('sha256', 'offline signing fixture').update(input).digest('base64url')}`
  return { access_token: jwt, refresh_token: 'offline-refresh-fixture', expires_at: exp, expires_in: 900, token_type: 'bearer', user }
}
async function offlineBackend(page: Page, options: { rejectRefresh?: boolean } = {}) {
  const session = fixtureSession()
  const calls: { path: string; bearer?: string }[] = []
  const consoleErrors: string[] = []
  const counts = new Map<string, number>()
  const gate = createMemberHandler({ passwordHash: createHash('sha256').update(password).digest('hex'),
    bump: async (key, window) => { const id = key + window; const n = (counts.get(id) ?? 0) + 1; counts.set(id, n); return n },
    issueSession: async () => session,
  })
  let uploaded = false
  const phone = createPhoneHandler({
    lookup: async token => token === qr && !uploaded ? { id: 'offline', status: 'pending', expires_at: new Date(Date.now() + 600_000).toISOString() } : null,
    upload: async () => {}, complete: async () => { uploaded = true; return true },
  })
  page.on('pageerror', error => consoleErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:') &&
        !message.text().includes('fixture expired')) consoleErrors.push(message.text())
  })
  // Every non-local host is refused. Only Vite's own origin reaches the network.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4178') return route.continue()
    if (url.origin !== 'http://127.0.0.1:59999') return route.abort()
    const incoming = route.request()
    const headers = incoming.headers()
    if (url.pathname.startsWith('/functions/v1/')) {
      const handler = url.pathname.endsWith('/member-session') ? gate : phone
      const res = await handler(new Request(url, { method: incoming.method(), headers, body: incoming.postDataBuffer() }))
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() })
    }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: session.user })
    if (url.pathname === '/auth/v1/token') return route.fulfill(options.rejectRefresh
      ? { status: 400, json: { error: 'invalid_grant', error_description: 'fixture expired' } } : { json: session })
    if (url.pathname.startsWith('/rest/v1/')) {
      calls.push({ path: url.pathname, bearer: headers.authorization })
      if (headers.authorization !== `Bearer ${session.access_token}`) return route.fulfill({ status: 401, json: { message: 'member required' } })
      const table = url.pathname.split('/').pop()
      const data = table === 'boot_stats' ? { id: 'fixture', gesamtstunden: 100, startsaldo: 0, modell: 'Offline boat' } :
        table === 'abrechnung_config' ? { id: 'fixture', beitrag_pro_monat: 100, boot_marktwert: 10000 } : []
      return route.fulfill({ json: data })
    }
    return route.fulfill({ status: 404, json: { error: 'unmocked endpoint' } })
  })
  return { calls, consoleErrors, session, wasUploaded: () => uploaded }
}

test('old flag and wrong password stay locked; correct password gives every query a member pass', async ({ page }, info) => {
  const backend = await offlineBackend(page)
  await page.addInitScript(() => sessionStorage.setItem('boatbuddy-unlocked', 'true'))
  await page.goto('/dashboard')
  await expect(page.getByLabel('Passwort')).toBeVisible()
  await page.getByLabel('Passwort').fill('wrong fixture')
  await page.getByRole('button', { name: 'Weiter' }).click()
  await expect(page.getByRole('alert')).toHaveText('Falsches Passwort')
  expect(backend.calls).toHaveLength(0)
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Weiter' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await expect.poll(() => backend.calls.length).toBeGreaterThan(0)
  await expect(page.getByText('100 h', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await expect(page.getByText('100 h', { exact: true })).toBeVisible()
  expect(backend.calls.every(call => call.bearer === `Bearer ${backend.session.access_token}`)).toBe(true)
  expect(backend.consoleErrors).toEqual([])
  await page.screenshot({ path: info.outputPath('member-dashboard.png'), fullPage: true })
})

test('an expired session with a refused refresh cannot reveal boat data', async ({ page }) => {
  const backend = await offlineBackend(page, { rejectRefresh: true })
  await page.addInitScript(value => sessionStorage.setItem('sb-127-auth-token', value), JSON.stringify(fixtureSession(-60)))
  await page.goto('/dashboard')
  await expect(page.getByLabel('Passwort')).toBeVisible()
  expect(backend.calls).toHaveLength(0)
})

test('the public QR phone flow uploads a receipt without a member session or table access', async ({ page }, info) => {
  const backend = await offlineBackend(page)
  await page.goto(`/phone-upload?token=${qr}`)
  await expect(page.getByText('Rechnung fotografieren', { exact: true })).toBeVisible()
  await page.getByLabel('Rechnung fotografieren').setInputFiles('e2e/staging/test-receipt.png')
  await expect(page.getByAltText('Vorschau')).toBeVisible()
  await page.getByRole('button', { name: 'Hochladen', exact: true }).click()
  await expect(page.getByText('Foto erfolgreich hochgeladen!')).toBeVisible()
  expect(backend.wasUploaded()).toBe(true)
  expect(backend.calls).toHaveLength(0)
  expect(backend.consoleErrors).toEqual([])
  await page.screenshot({ path: info.outputPath('public-phone-upload.png'), fullPage: true })
})

test('a missing or used phone token has no public upload access', async ({ page }) => {
  const backend = await offlineBackend(page)
  await page.goto('/phone-upload?token=bad')
  await expect(page.getByText('Session ungültig oder abgelaufen')).toBeVisible()
  expect(backend.calls).toHaveLength(0)
})
