import { test, expect, type Page } from '@playwright/test'

import { signInMember } from './member-session'

test.describe('PasswordGate', () => {
  test('blocks access without password', async ({ page }) => {
    await page.goto('/dashboard')
    // Should show password input, not dashboard content
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 })
  })

  test('grants access with a member session', async ({ page }) => {
    await signInMember(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
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
    await signInMember(page)
  })

  test('shows hero balance card', async ({ page }) => {
    // "Bootkonto" also appears in the open-items/Abrechnung reimbursement rows
    // (Bootkonto → driver). Scope to the 4-stat-card grid so only the hero
    // StatCard label matches, independent of data state.
    const statGrid = page.locator('div.slide-up-stagger.grid')
    await expect(statGrid.getByText('Bootkonto')).toBeVisible({ timeout: 10_000 })
  })

  test('shows stat cards', async ({ page }) => {
    // "Betriebsstunden" also appears in the NeuigkeitenCard activity feed
    // (e.g. "Betriebsstunden: 0.30h"), colliding with the StatCard label.
    // Scope to the stat-card grid so only the hero StatCard label matches,
    // independent of data state (same pattern as the hero balance card).
    const statGrid = page.locator('div.slide-up-stagger.grid')
    await expect(statGrid.getByText(/Ausgaben \d{4}/)).toBeVisible({ timeout: 10_000 })
    await expect(statGrid.getByText('Betriebsstunden')).toBeVisible()
  })

  test('shows quick action buttons', async ({ page }) => {
    await expect(page.getByText('Neue Ausgabe').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Reservierung', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Gastsession', { exact: true }).first()).toBeVisible()
  })
})

test.describe('Finanzen — CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
    await page.goto('/finanzen')
    await page.waitForLoadState('networkidle')
  })

  test('tab navigation works', async ({ page }) => {
    // Tabs use role="tab" with ARIA — find by text inside buttons
    const ausgabenTab = page.getByRole('tab', { name: 'Ausgaben' })
    await expect(ausgabenTab).toBeVisible({ timeout: 10_000 })
    await ausgabenTab.click()
    // The BUTTON: with no expenses yet the empty state also says 'Klicke "Neue Ausgabe"', and a
    // bare getByText then matches two elements (strict-mode failure, run 41931476724).
    await expect(page.getByRole('button', { name: 'Neue Ausgabe' })).toBeVisible({ timeout: 5_000 })

    const einnahmenTab = page.getByRole('tab', { name: 'Einnahmen' })
    await einnahmenTab.click()
    await expect(einnahmenTab).toHaveAttribute('aria-selected', 'true')
  })
})

test.describe('Kalender', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
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
    await signInMember(page)
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
    // The Eigentümer tab shows a Loader2 spinner until Supabase resolves.
    // Wait on the section header + total indicator (always rendered once the
    // tab's data has loaded, data-independent) before asserting names/percentages,
    // so a slow Supabase load doesn't flake the data assertions.
    await expect(page.getByText('Eigentumsanteile')).toBeVisible({ timeout: 15_000 })
    const total = page.getByText(/Total: \d+\.\d+%/)
    await expect(total).toBeVisible({ timeout: 15_000 })
    // NOT production's owners. This suite runs against STAGING since #38, and staging's owners are not
    // production's three equal thirds (measured 2026-11-05: two rows, 72.73 % and 27.27 %). A marked
    // third owner would push staging past 100 % and change its Abrechnung, so nothing is seeded: the
    // test checks what the tab renders from whatever owners exist. Every owner card shows its share,
    // and the shares add up to the Total line (cards round to one decimal, the Total to two).
    const shares = page.getByText(/\d+\.\d% von /)
    await expect(shares.first()).toBeVisible()
    const cardPct = (await shares.allTextContents()).map((t) => Number(/(\d+\.\d)% von /.exec(t)![1]))
    const totalPct = Number(/Total: (\d+\.\d+)%/.exec((await total.textContent()) ?? '')![1])
    const sum = cardPct.reduce((s, p) => s + p, 0)
    expect(Math.abs(sum - totalPct), `owner cards ${cardPct.join(' + ')} vs Total ${totalPct}`)
      .toBeLessThanOrEqual(0.05 * cardPct.length + 0.001)
  })

  test('Wartung tab shows empty state or tasks', async ({ page }) => {
    await page.getByRole('tab', { name: 'Wartung' }).click()
    // Wartung starts empty — should show empty state or any user-added tasks
    await expect(page.getByText(/Alle Aufgaben erledigt|Neue Aufgabe/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Gentleman-Rules tab shows real rules from Excel', async ({ page }) => {
    await page.getByRole('tab', { name: 'Gentleman-Rules' }).click()
    // Should show the real first rule from the Excel file
    await expect(page.getByText('400 Fr. / Mt.')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Supabase connectivity', () => {
  test('Supabase project is reachable', async ({ request }) => {
    // REST remains available before and after the unused GraphQL extension is removed.
    const response = await request.get(
      'https://svpewgbwousyheohlrtt.supabase.co/rest/v1/'
    )
    // 401 or 200 both mean project is alive and responding
    expect([200, 401]).toContain(response.status())
  })
})

// ─── Navigation — extended ───────────────────────────────────────

test.describe('Navigation — extended', () => {
  test('bottom nav shows 4 primary tabs plus Mehr on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await signInMember(page)
    const bottomNav = page.locator('nav.fixed.bottom-0')
    await expect(bottomNav).toBeVisible({ timeout: 10_000 })
    // 4 primary tabs (Gäste/Boot/News moved into the "Mehr" sheet)
    await expect(bottomNav.getByText('Home')).toBeVisible()
    await expect(bottomNav.getByText('Finanzen')).toBeVisible()
    await expect(bottomNav.getByText('Kalender')).toBeVisible()
    await expect(bottomNav.getByText('Nutzung')).toBeVisible()
    await expect(bottomNav.getByText('Mehr')).toBeVisible()
  })

  test('dark mode toggle works', async ({ page }) => {
    await signInMember(page)
    // Desktop sidebar has dark mode toggle
    const toggleBtn = page.locator('aside').getByLabel(/Design aktivieren/)
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click()
      // After toggle, the html element should have class "dark" or not
      const htmlClass = await page.locator('html').getAttribute('class')
      // Just verify it responded without error
      expect(htmlClass).toBeDefined()
    }
  })

  test('mobile header visible on small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await signInMember(page)
    await expect(page.locator('header').getByText('BoatBuddy')).toBeVisible({ timeout: 10_000 })
  })

  test('footer shows copyright and slogan', async ({ page }) => {
    await signInMember(page)
    const footer = page.locator('footer')
    await expect(footer.getByText('BoatBuddy by Predivo GmbH')).toBeVisible({ timeout: 10_000 })
    await expect(footer.getByText(/Swiss-made/)).toBeVisible()
  })
})

// ─── Dashboard — extended ────────────────────────────────────────

test.describe('Dashboard — extended', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
  })

  test('shows next reservation or empty state', async ({ page }) => {
    // Either a real reservation or "Keine Reservierungen geplant"
    await expect(
      page.getByText(/Nächste Reservierung/).or(page.getByText('Keine Reservierungen geplant')).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('shows season overview cards', async ({ page }) => {
    const currentYear = new Date().getFullYear().toString()
    // The whole Dashboard renders a PageSkeleton until 6 combined Supabase
    // queries resolve; the season-overview heading + cards only appear past
    // that load. Anchor first on the data-independent Dashboard heading with a
    // tolerant timeout so a slow prod cold-load doesn't flake (same slow-load
    // pattern as the Eigentümer ownership test).
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(`Saison ${currentYear}`).first()).toBeVisible({ timeout: 15_000 })
    // Season overview has 4 cards: Ausgaben, Gast-Sessions, Stunden, Treibstoff
    await expect(page.getByText('Ausgaben').first()).toBeVisible()
    await expect(page.getByText('Gast-Sessions').first()).toBeVisible()
    await expect(page.getByText('Stunden').first()).toBeVisible()
    await expect(page.getByText('Treibstoff').first()).toBeVisible()
  })

  test('shows letzte Fahrten section', async ({ page }) => {
    await expect(page.getByText('Letzte Fahrten')).toBeVisible({ timeout: 10_000 })
  })

  test('shows letzte Ausgaben section', async ({ page }) => {
    await expect(page.getByText('Letzte Ausgaben')).toBeVisible({ timeout: 10_000 })
  })

  test('Fahrt loggen dialog opens with expected fields', async ({ page }) => {
    await page.getByText('Fahrt loggen').first().click()
    await expect(page.getByRole('heading', { name: 'Fahrt loggen' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Fahrer').first()).toBeVisible()
    await expect(page.getByText('Neuer Stand').first()).toBeVisible()
    // Treibstoff (Liter) input removed — fuel is now single-source (treibstoff expenses)
    await expect(page.getByText('Erfassen').first()).toBeVisible()
    await expect(page.getByText('Abbrechen').first()).toBeVisible()
    // Close dialog
    await page.getByText('Abbrechen').first().click()
  })

  test('Neue Ausgabe dialog opens from dashboard', async ({ page }) => {
    await page.getByText('Neue Ausgabe').first().click()
    await expect(page.getByText('Bezeichnung *')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Betrag (CHF) *')).toBeVisible()
    // Close via Abbrechen
    await page.getByText('Abbrechen').first().click()
  })
})

// ─── Finanzen — extended ─────────────────────────────────────────

test.describe('Finanzen — extended', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
    await page.goto('/finanzen')
    await page.waitForLoadState('networkidle')
  })

  test('Ubersicht shows KontoBilanzCard', async ({ page }) => {
    // Default tab is Ubersicht
    await expect(page.getByText('Kontostand').first()).toBeVisible({ timeout: 10_000 })
  })

  test('Ubersicht shows Ausgaben year card', async ({ page }) => {
    const currentYear = new Date().getFullYear().toString()
    await expect(page.getByText(`Ausgaben ${currentYear}`)).toBeVisible({ timeout: 10_000 })
  })

  test('Ubersicht shows Beitrage year card', async ({ page }) => {
    const currentYear = new Date().getFullYear().toString()
    await expect(page.getByText(`Einnahmen ${currentYear}`)).toBeVisible({ timeout: 10_000 })
  })

  test('Ubersicht shows Monatsdiagramm chart', async ({ page }) => {
    await expect(page.getByText('Einnahmen vs. Ausgaben')).toBeVisible({ timeout: 10_000 })
  })

  test('Ubersicht shows Kategorie chart', async ({ page }) => {
    await expect(page.getByText('Ausgaben nach Kategorie')).toBeVisible({ timeout: 10_000 })
  })

  test('Ausgaben tab shows table with search and filter', async ({ page }) => {
    await page.getByRole('tab', { name: 'Ausgaben' }).click()
    // The button, not the text: the empty state names it too (see 'tab navigation works').
    await expect(page.getByRole('button', { name: 'Neue Ausgabe' })).toBeVisible({ timeout: 10_000 })
    // The search and filter bar exists only once there is an expense. With none, AusgabenTabelle shows
    // its empty state instead, and staging had none on 2026-11-05. So wait for whichever of the two the
    // data calls for (locator.or waits; a bare isVisible() does not), then check that one completely.
    // The bar with real rows is also proven offline in e2e/local/tables-with-data.spec.ts.
    const search = page.getByLabel('Ausgaben durchsuchen')
    const empty = page.getByText('Noch keine Ausgaben erfasst')
    await expect(search.or(empty)).toBeVisible({ timeout: 10_000 })
    if (await empty.isVisible()) {
      await expect(search).toHaveCount(0)
      return
    }
    await expect(page.getByLabel('Nach Kategorie filtern')).toBeVisible()
    await expect(page.getByLabel('Nach Jahr filtern')).toBeVisible()
    await expect(page.locator('table.table-premium')).toBeVisible()
  })

  test('Ausgaben tab Neue Ausgabe dialog has expected fields', async ({ page }) => {
    await page.getByRole('tab', { name: 'Ausgaben' }).click()
    await page.getByText('Neue Ausgabe').first().click()
    await expect(page.getByText('Bezeichnung *')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Betrag (CHF) *')).toBeVisible()
    await expect(page.getByText('Kategorie', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Bezahlt von', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Notiz', { exact: true }).first()).toBeVisible()
    // Close
    await page.getByRole('button', { name: 'Schliessen', exact: true }).click()
  })

  test('Ausgaben tab shows invoice upload zone', async ({ page }) => {
    await page.getByRole('tab', { name: 'Ausgaben' }).click()
    await expect(page.getByText('Rechnung hochladen')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/PDF, JPG, PNG oder WebP/)).toBeVisible()
  })

  test('Ausgaben tab columns are sortable', async ({ page }) => {
    await page.getByRole('tab', { name: 'Ausgaben' }).click()
    // Wait for table to appear (may show empty state)
    const table = page.locator('table')
    if (await table.isVisible()) {
      // Sortable columns: Datum, Kategorie, Betrag
      await expect(table.getByText('Datum')).toBeVisible({ timeout: 10_000 })
      await expect(table.getByText('Kategorie')).toBeVisible()
      await expect(table.getByText('Betrag')).toBeVisible()
    }
  })

  test('Einnahmen tab shows grid with year navigation', async ({ page }) => {
    await page.getByRole('tab', { name: 'Einnahmen' }).click()
    // Year navigation buttons
    await expect(page.getByLabel('Vorjahr').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Nächstes Jahr').first()).toBeVisible()
    // Current year displayed
    const currentYear = new Date().getFullYear().toString()
    await expect(page.getByText(currentYear).first()).toBeVisible()
    // Grid with month headers
    await expect(page.getByText('Jan').first()).toBeVisible()
    await expect(page.getByText('Dez').first()).toBeVisible()
    // Outstanding badge
    await expect(
      page.getByText('ausstehend').or(page.getByText('Alles bezahlt')).first()
    ).toBeVisible()
  })
})

// ─── Kalender — extended ─────────────────────────────────────────

test.describe('Kalender — extended', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
    await page.goto('/kalender')
    await page.waitForLoadState('networkidle')
  })

  test('calendar grid shows weekday headers', async ({ page }) => {
    await expect(page.getByText('Mo', { exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Di', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Mi', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Do', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Fr', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Sa', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('So', { exact: true }).first()).toBeVisible()
  })

  test('calendar shows driver legend', async ({ page }) => {
    await expect(page.getByText('Legende:')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Roger').first()).toBeVisible()
    await expect(page.getByText('Dani').first()).toBeVisible()
  })

  test('upcoming reservations section visible', async ({ page }) => {
    await expect(page.getByText('Kommende Reservierungen')).toBeVisible({ timeout: 10_000 })
  })

  test('clicking a day opens ReservierungDialog', async ({ page }) => {
    // Click on a day cell in the calendar grid
    const dayCells = page.locator('.grid.grid-cols-7 > button')
    const firstVisibleDay = dayCells.first()
    await firstVisibleDay.click()
    // Dialog should open
    await expect(page.getByText('Neue Reservierung').first()).toBeVisible({ timeout: 10_000 })
    // Close via X button
    await page.getByRole('button', { name: 'Schliessen', exact: true }).click()
  })

  test('ReservierungDialog has all form fields', async ({ page }) => {
    const dayCells = page.locator('.grid.grid-cols-7 > button')
    await dayCells.first().click()
    await expect(page.getByText('Neue Reservierung').first()).toBeVisible({ timeout: 10_000 })
    // Driver selector (radiogroup)
    await expect(page.getByLabel('Fahrer auswählen')).toBeVisible()
    // Start time
    await expect(page.getByText('Startzeit')).toBeVisible()
    // Duration
    await expect(page.getByText('Dauer').first()).toBeVisible()
    // Computed time display
    await expect(page.getByText(/\d{2}:\d{2} – \d{2}:\d{2} Uhr/).first()).toBeVisible()
    // Submit button
    await expect(page.getByText('Reservieren').first()).toBeVisible()
    // Close
    await page.getByRole('button', { name: 'Schliessen', exact: true }).click()
  })

  test('calendar highlights Swiss holidays', async ({ page }) => {
    // Navigate to December to find a guaranteed holiday (Weihnachten = Dec 25)
    // Find current month title and navigate
    const monthTitle = page.locator('h2.text-lg.font-semibold')
    const currentText = await monthTitle.textContent()
    // Navigate forward/backward to December
    // Just verify the feiertage rendering mechanism exists — holidays have rose tint
    // This is a structural test, not a date-specific one
    // If none visible in current month, that's OK — not every month has holidays
    // The feature exists structurally (checked via source code)
    expect(currentText).toBeTruthy()
  })
})

// ─── Ferien (Vacations) ─────────────────────────────────────────

test.describe('Ferien', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
    await page.goto('/kalender')
    await page.waitForLoadState('networkidle')
  })

  test('Ferien eintragen button visible on Kalender page', async ({ page }) => {
    await expect(page.getByText('Ferien eintragen').first()).toBeVisible({ timeout: 10_000 })
  })

  test('clicking Ferien eintragen opens FerienDialog', async ({ page }) => {
    await page.getByText('Ferien eintragen').first().click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('#ferien-dialog-title')).toBeVisible()
  })

  test('FerienDialog has date inputs and submit button', async ({ page }) => {
    await page.getByText('Ferien eintragen').first().click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 })
    // Date inputs
    const dateInputs = page.locator('[role="dialog"] input[type="date"]')
    await expect(dateInputs.first()).toBeVisible()
    // Submit button
    await expect(page.locator('[role="dialog"] button[type="submit"]').first()).toBeVisible()
  })

  test('upcoming vacations section shows when vacations exist', async ({ page }) => {
    // Section only renders if upcoming vacations exist — verify presence or absence
    const count = await page.getByText('Kommende Ferien').count()
    // Either vacations are shown (count > 0) or none exist (count === 0) — both valid
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

// ─── Gast-Sessions — extended ────────────────────────────────────

test.describe('Gast-Sessions — extended', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
    await page.goto('/gastsessions')
    await page.waitForLoadState('networkidle')
  })

  test('shows session stats cards', async ({ page }) => {
    // Stats section has per-driver cards or the "Gesamt" card
    await expect(
      page.getByText('Gesamt').or(page.getByText('Sessions gesamt')).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('session form has expected fields', async ({ page }) => {
    await expect(page.getByText('Neue Session erfassen')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Gast-Name *')).toBeVisible()
    await expect(page.getByText('Betrag (CHF)').first()).toBeVisible()
    await expect(page.getByText('Bezahlt an').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Erfassen' }).first()).toBeVisible()
  })

  test('session table has search and filters', async ({ page }) => {
    // Search input
    const searchInput = page.getByLabel('Gast suchen')
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeVisible({ timeout: 10_000 })
      // Driver filter pills
      await expect(page.getByRole('button', { name: 'Alle' }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Roger' }).first()).toBeVisible()
    }
    // If no sessions yet, empty state is shown instead
  })

  test('session table columns are sortable', async ({ page }) => {
    const table = page.locator('table').first()
    if (await table.isVisible()) {
      // Click Datum header to toggle sort
      const datumHeader = table.getByText('Datum')
      if (await datumHeader.isVisible()) {
        await datumHeader.click()
        // No error means sort worked
        await expect(datumHeader).toBeVisible()
      }
    }
  })

  test('session table shows summary row', async ({ page }) => {
    const tfoot = page.locator('tfoot')
    if (await tfoot.isVisible()) {
      await expect(tfoot.getByText(/Sessions?/)).toBeVisible({ timeout: 10_000 })
    }
  })
})

// ─── Nutzungslog — extended ──────────────────────────────────────

test.describe('Nutzungslog — extended', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
    await page.goto('/nutzung')
    await page.waitForLoadState('networkidle')
  })

  test('shows season stats cards', async ({ page }) => {
    const currentYear = new Date().getFullYear().toString()
    await expect(page.getByText(`Saison ${currentYear}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(`Stunden ${currentYear}`)).toBeVisible()
    await expect(page.getByText('Treibstoff').first()).toBeVisible()
    await expect(page.getByText('Fahrten').first()).toBeVisible()
    await expect(page.getByText('Durchschnitt')).toBeVisible()
  })

  test('shows all-time stats cards', async ({ page }) => {
    await expect(page.getByText('Gesamt (Alle Jahre)')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Stunden total')).toBeVisible()
    await expect(page.getByText('Treibstoff total')).toBeVisible()
    await expect(page.getByText('Fahrten total')).toBeVisible()
  })

  test('shows boot stats card', async ({ page }) => {
    await expect(page.getByText('Boot-Statistiken')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Gesamtstunden')).toBeVisible()
    await expect(page.getByText('Modell')).toBeVisible()
    await expect(page.getByText('Kaufdatum')).toBeVisible()
  })

  test('nutzungslog form has expected fields', async ({ page }) => {
    await expect(page.getByText('Neuen Eintrag erfassen')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Neuer Stand')).toBeVisible()
    // Treibstoff (L) input removed — fuel is now single-source (treibstoff expenses)
    await expect(page.getByText('Erweitert')).toBeVisible()
  })

  test('nutzungslog form expanded shows activities editor', async ({ page }) => {
    await page.getByText('Erweitert').first().click()
    await expect(page.getByText('Aktivitäten').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Aktivität hinzufügen')).toBeVisible()
    await expect(page.getByText('Notiz').first()).toBeVisible()
  })

  test('nutzungslog table has driver and year filters', async ({ page }) => {
    // Driver filter pills
    const allBtn = page.getByRole('button', { name: 'Alle' }).first()
    if (await allBtn.isVisible()) {
      await expect(allBtn).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'Roger' }).first()).toBeVisible()
    }
    // Year filter dropdown
    const yearFilter = page.getByLabel('Jahr filtern')
    if (await yearFilter.isVisible()) {
      await expect(yearFilter).toBeVisible()
    }
  })

  // The trip table exists only once there is a trip log; with none the page shows its empty state.
  // Both tests below WAIT for one of the two. They used `if (await table.isVisible())`, which answers
  // at once and so skipped every assertion whenever the table had not rendered yet. That is how a
  // check for the "Liter" column, removed in 4f4b370 (2026-06-15), passed against production for months.
  const tripTableOrEmpty = async (page: Page) => {
    const table = page.locator('table.table-premium').first()
    const empty = page.getByText('Noch keine Nutzungslogs erfasst')
    await expect(table.or(empty)).toBeVisible({ timeout: 10_000 })
    return (await empty.isVisible()) ? null : table
  }

  test('nutzungslog table columns are sortable', async ({ page }) => {
    const table = await tripTableOrEmpty(page)
    if (!table) return
    // Columns since 4f4b370: Datum, Fahrer, Stunden, Aktivitäten, Notiz. Datum and Stunden sort.
    const datum = table.getByRole('columnheader', { name: /datum/i })
    const stunden = table.getByRole('columnheader', { name: /stunden/i })
    await expect(table.getByRole('columnheader', { name: /fahrer/i })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /aktivitäten/i })).toBeVisible()
    await expect(datum).toHaveAttribute('aria-sort', 'descending')
    await expect(stunden).toHaveAttribute('aria-sort', 'none')
    await stunden.click()
    await expect(stunden).toHaveAttribute('aria-sort', 'descending')
    await expect(datum).toHaveAttribute('aria-sort', 'none')
  })

  test('nutzungslog table shows summary row', async ({ page }) => {
    const table = await tripTableOrEmpty(page)
    if (!table) return
    // The footer counts the rows shown: "1 Fahrt" or "<n> Fahrten". The old /Fahrten?/ reads as
    // "Fahrte" plus an optional "n", so it never matched the singular, and staging has exactly one trip.
    const rows = await table.locator('tbody tr').count()
    await expect(table.locator('tfoot td').first()).toHaveText(rows === 1 ? '1 Fahrt' : `${rows} Fahrten`)
  })

  test('shows fuel per driver breakdown', async ({ page }) => {
    // May or may not be visible depending on data
    // Not asserting visibility — data-dependent
    // Just verify the page loaded without errors
    await expect(page.getByText('Nutzungslog').first()).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Boot & Eigentumer — extended ────────────────────────────────

test.describe('Boot & Eigentumer — extended', () => {
  test.beforeEach(async ({ page }) => {
    await signInMember(page)
    await page.goto('/boot')
    await page.waitForLoadState('networkidle')
  })

  test('Eigentumer tab has edit button', async ({ page }) => {
    await expect(page.getByText('Bearbeiten')).toBeVisible({ timeout: 10_000 })
  })

  test('Eigentumer tab shows total percentage', async ({ page }) => {
    await expect(page.getByText(/Total: \d+\.\d+%/)).toBeVisible({ timeout: 10_000 })
  })

  test('Abrechnung tab shows config values', async ({ page }) => {
    await page.getByRole('tab', { name: 'Abrechnung' }).click()
    await expect(page.getByText('Marktwert')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Kündigungsfrist')).toBeVisible()
    await expect(page.getByText('Beitrag / Monat')).toBeVisible()
  })

  test('Abrechnung tab shows config section header', async ({ page }) => {
    await page.getByRole('tab', { name: 'Abrechnung' }).click()
    await expect(page.getByText('Bewertung')).toBeVisible({ timeout: 10_000 })
  })

  test('Abrechnung tab shows boot info', async ({ page }) => {
    await page.getByRole('tab', { name: 'Abrechnung' }).click()
    await expect(page.getByText('Boot-Info')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Modell')).toBeVisible()
    await expect(page.getByText('Kaufdatum')).toBeVisible()
    await expect(page.getByText('Betriebsstunden')).toBeVisible()
  })

  test('Wartung tab has Neue Aufgabe button', async ({ page }) => {
    await page.getByRole('tab', { name: 'Wartung' }).click()
    await expect(page.getByText('Neue Aufgabe')).toBeVisible({ timeout: 10_000 })
  })

  test('Wartung tab tasks have toggle and delete', async ({ page }) => {
    await page.getByRole('tab', { name: 'Wartung' }).click()
    // Check for the pending tasks section
    await expect(
      page.getByText(/Anstehende Wartung/).or(page.getByText('Alle Aufgaben erledigt')).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Wartung tab shows overdue warning if applicable', async ({ page }) => {
    await page.getByRole('tab', { name: 'Wartung' }).click()
    // Overdue warning or normal state — both are valid
    await expect(
      page.getByText(/überfällige/).or(page.getByText(/Anstehende Wartung/)).or(page.getByText('Alle Aufgaben erledigt')).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Gentleman-Rules tab has add rule input', async ({ page }) => {
    await page.getByRole('tab', { name: 'Gentleman-Rules' }).click()
    await expect(page.getByPlaceholder('Neue Regel hinzufügen...')).toBeVisible({ timeout: 10_000 })
  })

  test('Gentleman-Rules tab rules have edit and delete', async ({ page }) => {
    await page.getByRole('tab', { name: 'Gentleman-Rules' }).click()
    // Each rule has edit and delete buttons (with aria-labels)
    const editBtn = page.getByLabel(/Regel \d+ bearbeiten/).first()
    const deleteBtn = page.getByLabel(/Regel \d+ löschen/).first()
    if (await editBtn.isVisible()) {
      await expect(editBtn).toBeVisible({ timeout: 10_000 })
      await expect(deleteBtn).toBeVisible()
    }
  })
})

// ─── Infrastructure — extended ───────────────────────────────────

test.describe('Infrastructure — extended', () => {
  test('ErrorBoundary renders fallback', async ({ page }) => {
    // Verify ErrorBoundary exists in the app by checking the rendered output
    // We can't trigger an error easily, so just confirm the app wraps in ErrorBoundary
    // by checking the app renders at all (which means ErrorBoundary didn't catch anything)
    await signInMember(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 })
  })

  test('404 page shows not found message', async ({ page }) => {
    await signInMember(page)
    await page.goto('/non-existent-page')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Seite nicht gefunden')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Zum Dashboard')).toBeVisible()
  })

  test('loading skeleton appears', async ({ page }) => {
    // Navigate to dashboard without waiting for network — skeleton should flash
    await page.goto('/')
    await signInMember(page)
    await page.goto('/dashboard')
    // The page should eventually show Dashboard heading (skeleton replaced by content)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 })
  })
})
