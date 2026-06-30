import { test, expect } from '@playwright/test'

// Post-gate checks against the deployed staging site: every main page must load and
// be free of console errors. This is the gate that protects production — a push to
// main must turn these green on staging before a manual prod promote is allowed.

// PasswordGate bypass: same mechanism as the production critical-path spec.
async function bypassPasswordGate(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.setItem('boatbuddy-unlocked', 'true'))
}

const PAGES: { path: string; heading: string }[] = [
  { path: '/dashboard', heading: 'Dashboard' },
  { path: '/finanzen', heading: 'Finanzen' },
  { path: '/kalender', heading: 'Kalender' },
  { path: '/gastsessions', heading: 'Gast-Sessions' },
  { path: '/nutzung', heading: 'Nutzungslog' },
  { path: '/boot', heading: 'Boot & Eigentümer' },
  { path: '/neuigkeiten', heading: 'Neuigkeiten' },
]

test.describe('Staging — authenticated', () => {
  test.beforeEach(async ({ page }) => {
    await bypassPasswordGate(page)
  })

  test('dashboard loads after bypass', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 })
  })

  test('sidebar shows all 7 nav items', async ({ page }) => {
    await page.goto('/dashboard')
    const sidebar = page.locator('aside')
    for (const label of ['Dashboard', 'Finanzen', 'Kalender', 'Gast-Sessions', 'Nutzungslog', 'Boot & Regeln', 'Neuigkeiten']) {
      await expect(sidebar.getByText(label, { exact: true })).toBeVisible()
    }
  })

  for (const { path, heading } of PAGES) {
    test(`${path} loads with no console errors`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 10_000 })
      expect(errors, `console errors on ${path}:\n${errors.join('\n')}`).toHaveLength(0)
    })
  }

  // BOOT-015: account/season reset feature (Boot > Abrechnung)
  test('Boot > Abrechnung shows the Kontostand-Reset feature', async ({ page }) => {
    await page.goto('/boot')
    await page.getByRole('tab', { name: 'Abrechnung' }).click()
    await expect(page.getByRole('heading', { name: 'Kontostand zurücksetzen' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Neuer Kontostand (CHF)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zurücksetzen' })).toBeVisible()
  })
})
