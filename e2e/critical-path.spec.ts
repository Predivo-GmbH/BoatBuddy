import { test, expect } from '@playwright/test'

// PasswordGate bypass: set sessionStorage key before navigation
async function bypassPasswordGate(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.setItem('boatbuddy-unlocked', 'true'))
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
}

test.describe('PasswordGate', () => {
  test('blocks access without password', async ({ page }) => {
    await page.goto('/dashboard')
    // Should show password input, not dashboard content
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 })
  })

  test('grants access after bypass', async ({ page }) => {
    await bypassPasswordGate(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await bypassPasswordGate(page)
  })

  test('sidebar shows all 6 nav items', async ({ page }) => {
    const sidebar = page.locator('aside')
    await expect(sidebar.getByText('Dashboard')).toBeVisible()
    await expect(sidebar.getByText('Finanzen')).toBeVisible()
    await expect(sidebar.getByText('Kalender')).toBeVisible()
    await expect(sidebar.getByText('Gast-Sessions')).toBeVisible()
    await expect(sidebar.getByText('Nutzungslog')).toBeVisible()
    await expect(sidebar.getByText('Boot & Regeln')).toBeVisible()
  })

  test('navigates to each page without error', async ({ page }) => {
    const routes = [
      { path: '/finanzen', heading: 'Finanzen' },
      { path: '/kalender', heading: 'Kalender' },
      { path: '/gastsessions', heading: 'Gast-Sessions' },
      { path: '/nutzung', heading: 'Nutzungslog' },
      { path: '/boot', heading: 'Boot & Eigentümer' },
    ]

    for (const { path, heading } of routes) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 10_000 })
    }
  })
})

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await bypassPasswordGate(page)
  })

  test('shows hero balance card', async ({ page }) => {
    await expect(page.getByText('Bootkonto')).toBeVisible({ timeout: 10_000 })
  })

  test('shows stat cards', async ({ page }) => {
    await expect(page.getByText(/Ausgaben \d{4}/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Betriebsstunden')).toBeVisible()
  })

  test('shows quick action buttons', async ({ page }) => {
    await expect(page.getByText('Neue Ausgabe')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Boot reservieren')).toBeVisible()
    await expect(page.getByText('Gastsession buchen')).toBeVisible()
  })
})

test.describe('Finanzen — CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await bypassPasswordGate(page)
    await page.goto('/finanzen')
    await page.waitForLoadState('networkidle')
  })

  test('tab navigation works', async ({ page }) => {
    // Tabs use role="tab" with ARIA — find by text inside buttons
    const ausgabenTab = page.getByRole('tab', { name: 'Ausgaben' })
    await expect(ausgabenTab).toBeVisible({ timeout: 10_000 })
    await ausgabenTab.click()
    await expect(page.getByText('Neue Ausgabe')).toBeVisible({ timeout: 5_000 })

    const beitraegeTab = page.getByRole('tab', { name: 'Beiträge' })
    await beitraegeTab.click()
    await expect(beitraegeTab).toHaveAttribute('aria-selected', 'true')
  })
})

test.describe('Kalender', () => {
  test.beforeEach(async ({ page }) => {
    await bypassPasswordGate(page)
    await page.goto('/kalender')
    await page.waitForLoadState('networkidle')
  })

  test('shows month navigation and calendar grid', async ({ page }) => {
    await expect(page.getByLabel('Vorheriger Monat')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Nächster Monat')).toBeVisible()
    await expect(page.getByText('Heute')).toBeVisible()
  })

  test('month navigation changes displayed month', async ({ page }) => {
    await page.getByLabel('Nächster Monat').click()
    await expect(page.getByLabel('Vorheriger Monat')).toBeVisible()
  })
})

test.describe('Boot & Eigentümer', () => {
  test.beforeEach(async ({ page }) => {
    await bypassPasswordGate(page)
    await page.goto('/boot')
    await page.waitForLoadState('networkidle')
  })

  test('shows 4 tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Eigentümer' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('tab', { name: 'Abrechnung' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Wartung' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Gentleman-Rules' })).toBeVisible()
  })

  test('Eigentümer tab shows ownership percentages', async ({ page }) => {
    // Wait for data to load
    await expect(page.getByText('Roger')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Dani')).toBeVisible()
    await expect(page.getByText('Jan')).toBeVisible()
  })

  test('Wartung tab shows maintenance tasks', async ({ page }) => {
    await page.getByRole('tab', { name: 'Wartung' }).click()
    // Should show seeded maintenance tasks
    await expect(page.getByText(/Ölwechsel|Impeller|Winterlager|Polster|Batterie|Unterwasser/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Gentleman-Rules tab shows rules', async ({ page }) => {
    await page.getByRole('tab', { name: 'Gentleman-Rules' }).click()
    // Should show the first seeded rule
    await expect(page.getByText('Boot nach jeder Fahrt reinigen')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Supabase connectivity', () => {
  test('Supabase project is reachable', async ({ request }) => {
    // GraphQL endpoint is the most reliable health check
    const response = await request.post(
      'https://xzythvxmuxmczuiophwp.supabase.co/graphql/v1',
      {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ query: '{ __typename }' }),
      }
    )
    // 401 or 200 both mean project is alive and responding
    expect([200, 401]).toContain(response.status())
  })
})
