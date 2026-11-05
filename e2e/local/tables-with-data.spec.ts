import { test, expect, type Page } from '@playwright/test'
import { createHash, createHmac } from 'node:crypto'
import { createMemberHandler, SHARED_MEMBER_ID } from '../../supabase/functions/member-session/handler'

// WHY THIS EXISTS (2026-11-05). The critical-path suite runs against STAGING since #38, and staging has
// no expenses. With none, AusgabenTabelle renders its empty state and never its search and filter bar, so
// the critical-path test now checks whichever state the data calls for. This file keeps the other state
// proven: the same tables with rows, entirely offline (no host, no key, no write), on desktop and mobile.
const password = 'offline-only fixture password'
const now = '2026-11-05T00:00:00Z'
const TABLES: Record<string, unknown[]> = {
  ausgaben: [
    { id: 'x1', datum: '2026-03-10', bezeichnung: 'Fixture Motoröl', betrag: 40, kategorie: 'wartung', bezahlt_von: 'bootkonto', erstellt_am: now },
    { id: 'x2', datum: '2025-07-02', bezeichnung: 'Fixture Hafengebühr', betrag: 120, kategorie: 'sonstiges', bezahlt_von: 'bootkonto', erstellt_am: now },
  ],
  nutzungslogs: [1, 2].map(n => ({ id: `t${n}`, datum: `2026-0${n}-04`, fahrer: 'roger', betriebsstunden: n, treibstoff_liter: null,
    aktivitaeten: [], teilnehmer: [], motorstunden_stand: null, reservierung_id: null, notiz: null, erstellt_am: now })),
  boot_stats: [{ id: 'fixture', gesamtstunden: 100, startsaldo: 0, modell: 'Offline boat', aktualisiert_am: now }],
  abrechnung_config: [{ id: 'fixture', beitrag_pro_monat: 100, boot_marktwert: 10000, kuendigungsfrist_monate: 3, abschreibung_prozent: 0, bewertung_datum: null }],
}

async function signedIn(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 900
  const user = { id: SHARED_MEMBER_ID, aud: 'authenticated', role: 'authenticated', app_metadata: { boatbuddy_member: true }, user_metadata: {} }
  const input = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ ...user, sub: user.id, exp, iat: exp - 900 })).toString('base64url')}`
  const session = { access_token: `${input}.${createHmac('sha256', 'offline signing fixture').update(input).digest('base64url')}`,
    refresh_token: 'offline-refresh-fixture', expires_at: exp, expires_in: 900, token_type: 'bearer', user }
  const gate = createMemberHandler({ passwordHash: createHash('sha256').update(password).digest('hex'),
    bump: async () => 1, peek: async () => 0, issueSession: async () => session })
  // Every non-local host is refused, and the fixture tables are read-only.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4178') return route.continue()
    if (url.origin !== 'http://127.0.0.1:59999') return route.abort()
    const req = route.request()
    if (url.pathname.endsWith('/functions/v1/member-session')) {
      const res = await gate(new Request(url, { method: req.method(), headers: req.headers(), body: req.postData() }))
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() })
    }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: session.user })
    if (url.pathname === '/auth/v1/token') return route.fulfill({ json: session })
    if (url.pathname.startsWith('/rest/v1/') && req.method() === 'GET') {
      const rows = TABLES[url.pathname.split('/').pop()!] ?? []
      return route.fulfill({ json: (req.headers().accept ?? '').includes('vnd.pgrst.object') ? rows[0] ?? null : rows })
    }
    return route.fulfill({ status: 404, json: { error: 'unmocked endpoint' } })
  })
  await page.goto('/dashboard')
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Weiter' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
}

test('Ausgaben with rows shows its search and filter bar, and the search narrows the table', async ({ page }) => {
  await signedIn(page)
  await page.goto('/finanzen')
  await page.getByRole('tab', { name: 'Ausgaben' }).click()
  const search = page.getByLabel('Ausgaben durchsuchen')
  await expect(search).toBeVisible()
  await expect(page.getByLabel('Nach Kategorie filtern')).toBeVisible()
  await expect(page.getByLabel('Nach Jahr filtern')).toBeVisible()
  const rows = page.locator('table.table-premium tbody tr')
  await expect(rows).toHaveCount(2)
  await search.fill('Hafen')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Fixture Hafengebühr')
})

test('Nutzungslog footer says "Fahrten" for more than one trip, and the Stunden column sorts', async ({ page }) => {
  await signedIn(page)
  await page.goto('/nutzung')
  const table = page.locator('table.table-premium').first()
  await expect(table.locator('tfoot td').first()).toHaveText('2 Fahrten')
  const stunden = table.getByRole('columnheader', { name: /stunden/i })
  await expect(stunden).toHaveAttribute('aria-sort', 'none')
  await stunden.click()
  await expect(stunden).toHaveAttribute('aria-sort', 'descending')
})
