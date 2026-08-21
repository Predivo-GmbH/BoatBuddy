import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * v11 hardened audit gates — BoatBuddy (the trigger project).
 * Drives the LIVE staging site. Read-write against the STAGING Supabase
 * (svpewgbwousyheohlrtt). All secrets come from env (never committed):
 *   BB_MGMT_TOKEN  = Supabase Management API token (DB snapshots + row cleanup)
 *   BB_SVC_KEY     = staging service_role key (physical storage-object delete)
 *   STAGING_REF    = svpewgbwousyheohlrtt (default)
 *   STAGING_URL / STAGING_HTPASSWD_USER / STAGING_HTPASSWD_PASS via config
 *
 * Gate A  — constrained-viewport interaction (the original off-screen-Save bug)
 * Gate B/J — commit-boundary + orphan-file (draft-in-memory + storage residue)
 * Gate I  — data-volume 1000-cap (documented; optional seed)
 * Gate K  — fault-injected data loads (graceful, no white screen / stuck spinner)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_PNG = process.env.BB_TEST_PNG ?? path.resolve(__dirname, 'test-receipt.png')
const REF = process.env.STAGING_REF ?? 'svpewgbwousyheohlrtt'
const MGMT = process.env.BB_MGMT_TOKEN ?? ''
const SVC = process.env.BB_SVC_KEY ?? ''
const SUPA = `https://${REF}.supabase.co`
const MARKER = 'ZZ_V11GATE_DELETE_ME'

// ---- Management API helpers (superuser SQL; bypasses PostgREST 1000-cap) ----
async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt query ${res.status}: ${await res.text()}`)
  return res.json()
}
const ausgabenCount = async () =>
  Number((await sql<{ n: number }>(`select count(*)::int as n from public.ausgaben;`))[0].n)
const listDocs = async () =>
  (await sql<{ name: string }>(
    `select name from storage.objects where bucket_id='dokumente' order by created_at desc;`,
  )).map((r) => r.name)

async function deleteStorageObject(name: string): Promise<number> {
  const res = await fetch(`${SUPA}/storage/v1/object/dokumente/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  })
  return res.status
}

async function unlock(page: Page) {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.setItem('boatbuddy-unlocked', 'true'))
}

// -------------------------- GATE A: viewport reachability --------------------------
const VIEWPORTS = [
  { name: '390x844 portrait', w: 390, h: 844 },
  { name: '375x360 kb-open', w: 375, h: 360 },
  { name: '812x375 landscape', w: 812, h: 375 },
  { name: '667x375 landscape', w: 667, h: 375 },
]

type Reach = {
  rectTop: number; rectBottom: number; vh: number
  inViewport: boolean; visible: boolean; hitOk: boolean; hitTag: string | null
}

async function measure(page: Page, submitSel: () => ReturnType<Page['locator']>): Promise<Reach> {
  return submitSel().evaluate((el: Element) => {
    const r = el.getBoundingClientRect()
    const vh = window.visualViewport?.height ?? window.innerHeight
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const hit = document.elementFromPoint(cx, cy)
    const he = el as HTMLElement
    return {
      rectTop: Math.round(r.top), rectBottom: Math.round(r.bottom), vh: Math.round(vh),
      inViewport: r.bottom <= vh + 0.5 && r.top >= -0.5 && r.left >= -0.5 && r.right <= window.innerWidth + 0.5,
      visible: he.offsetParent !== null && r.width > 0 && r.height > 0,
      hitOk: hit === el || el.contains(hit) || (!!hit && hit.contains(el)),
      hitTag: hit ? `${hit.tagName}.${(typeof hit.className === 'string' ? hit.className.split(' ')[0] : '')}` : null,
    }
  })
}

async function runGateA(
  page: Page, modal: string, open: () => Promise<void>, submitName: RegExp,
) {
  const rows: string[] = []
  await page.setViewportSize({ width: 900, height: 900 })
  await open()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  const submit = () => dialog.getByRole('button', { name: submitName }).last()
  await expect(submit()).toBeVisible()

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h })
    await page.waitForTimeout(250)
    let m = await measure(page, submit)
    let reachable = m.inViewport && m.visible
    let viaScroll = false
    let scroller: string | null = null
    if (!reachable) {
      // v13.2 (audit-framework.md, Gate A step 1 + v11 manifest): the scroll allowance is
      // CONDITIONAL. It is admissible ONLY when the control sits inside a REAL scrolling
      // ancestor. scrollIntoView() on a control with no scrolling ancestor scrolls the
      // DOCUMENT and launders the off-screen-Save defect this gate exists to catch.
      scroller = await submit().evaluate((el: Element) => {
        let n: Element | null = el.parentElement
        while (n && n !== document.body && n !== document.documentElement) {
          const oy = getComputedStyle(n).overflowY
          if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
            const id = (n as HTMLElement).id
            return n.tagName.toLowerCase() + (id ? '#' + id : '')
          }
          n = n.parentElement
        }
        return null
      })
      if (scroller) {
        await submit().scrollIntoViewIfNeeded().catch(() => {})
        await page.waitForTimeout(150)
        const m2 = await measure(page, submit)
        if (m2.inViewport && m2.visible) { m = m2; reachable = true; viaScroll = true }
      }
    }
    if (!reachable || viaScroll) console.log(`  [gateA v13.2] ${vp.name}: viaScroll=${viaScroll} scrollerAncestor=${scroller ?? 'NONE'}`)
    expect.soft(reachable, `${modal} @ ${vp.name}: Speichern reachable`).toBe(true)
    expect.soft(m.hitOk, `${modal} @ ${vp.name}: hit-test == submit`).toBe(true)
    rows.push(
      `  ${modal.padEnd(20)} | ${vp.name.padEnd(18)} | reachable=${reachable}${viaScroll ? '(scroll)' : ''}`.padEnd(70) +
      ` | hitTest=${m.hitOk} | top=${m.rectTop} bottom=${m.rectBottom} vh=${m.vh} | hit=${m.hitTag}`,
    )
    if (vp.name === '375x360 kb-open') {
      await page.screenshot({ path: `test-results/gateA-${modal}-375x360.png` })
    }
  }
  console.log(`\n[GATE A] ${modal}\n${rows.join('\n')}`)
}

test.describe('BoatBuddy v11 gates', () => {
  test.beforeEach(async ({ page }) => { await unlock(page) })

  test('Gate A — AusgabeFormDialog (Finanzen) reachability', async ({ page }) => {
    await runGateA(page, 'AusgabeForm', async () => {
      await page.goto('/finanzen')
      await page.getByRole('tab', { name: 'Ausgaben' }).click()
      await page.getByRole('button', { name: 'Neue Ausgabe' }).first().click()
    }, /^Speichern/)
  })

  test('Gate A — ReservierungDialog (Kalender) reachability', async ({ page }) => {
    await runGateA(page, 'Reservierung', async () => {
      await page.goto('/kalender')
      // day cells are buttons labelled like "15. August 2026"
      await page.getByRole('button', { name: /^\d+\.\s\w+\s\d{4}$/ }).first().click()
    }, /Reservieren|^Speichern/)
  })

  test('Gate A — FerienDialog (Kalender) reachability', async ({ page }) => {
    await runGateA(page, 'FerienDialog', async () => {
      await page.goto('/kalender')
      await page.getByRole('button', { name: /Ferien eintragen/ }).click()
    }, /Ferien eintragen|^Speichern/)
  })

  // -------------------------- GATE B/J: commit-boundary + orphan --------------------------
  test('Gate B/J — upload commit-boundary + orphan-file residue', async ({ page }) => {
    test.setTimeout(220_000)
    expect(MGMT, 'BB_MGMT_TOKEN required').not.toBe('')

    // Pre-clean stale test rows a prior/cancelled run may have left, so a shared-staging
    // race can't poison the absolute-count baseline below (rows are marker-scoped).
    await sql(`delete from public.ausgaben where bezeichnung like '${MARKER}%';`)
    const created: string[] = []           // storage objects that appear during the test
    const baseline = await listDocs()
    const beforeCount = await ausgabenCount()
    console.log(`\n[GATE B/J] baseline: ausgaben=${beforeCount}, dokumente objects=${baseline.length}`)

    const supaHosts = new Set<string>()
    page.on('request', (r) => {
      const u = r.url()
      if (u.includes('/storage/v1/object/dokumente')) supaHosts.add(new URL(u).host)
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/finanzen')
    await page.getByRole('tab', { name: 'Ausgaben' }).click()
    await page.getByRole('button', { name: 'Neue Ausgabe' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // (2) upload a receipt — storage.upload fires on file-SELECT, before any Save
    const upResp = page.waitForResponse(
      (r) => r.url().includes('/storage/v1/object/dokumente') && r.request().method() === 'POST',
      { timeout: 60_000 },
    )
    await dialog.locator('input[type=file][aria-label="Beleg hochladen"]').setInputFiles(TEST_PNG)
    const up = await upResp
    console.log(`[GATE B/J] storage upload POST -> ${up.status()} host=${[...supaHosts].join(',')}`)
    expect([...supaHosts]).toContain(`${REF}.supabase.co`)   // browser writes to the ref we snapshot

    // Give storage.objects a beat to reflect, then snapshot mid-flow (before Save)
    await page.waitForTimeout(1500)
    const midCount = await ausgabenCount()
    const midDocs = await listDocs()
    const newAfterUpload = midDocs.filter((d) => !baseline.includes(d))
    newAfterUpload.forEach((d) => created.push(d))
    console.log(`[GATE B/J] after file-select (NO Save yet): ausgaben=${midCount} (delta ${midCount - beforeCount}), new dokumente=${JSON.stringify(newAfterUpload)}`)
    expect(midCount, 'NO ausgaben row written on upload (draft-in-memory holds)').toBe(beforeCount)
    expect(newAfterUpload.length, 'storage object IS written on file-select').toBeGreaterThan(0)

    // let extraction reach a terminal state (submit re-enables when not busy)
    await expect(dialog.getByRole('button', { name: /^Speichern/ })).toBeEnabled({ timeout: 150_000 })
    const belegAttached = await dialog.getByText(/Beleg angehängt/).isVisible().catch(() => false)
    console.log(`[GATE B/J] extraction terminal. Beleg-angehängt(dokumentPfad set)=${belegAttached}`)

    // (3) ABANDON without Save (Escape) — the shipped discardOrphan→removeReceipt fix
    // must clean up the uploaded file. removeReceipt is fire-and-forget (not awaited),
    // so poll briefly for the delete to land before asserting zero residue.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    const abandonCount = await ausgabenCount()
    let orphans: string[] = []
    for (let i = 0; i < 12; i++) {
      orphans = (await listDocs()).filter((d) => !baseline.includes(d))
      if (orphans.length === 0) break
      await page.waitForTimeout(500)
    }
    orphans.forEach((d) => { if (!created.includes(d)) created.push(d) })
    console.log(`[GATE B/J] AFTER ABANDON: ausgaben=${abandonCount} (delta ${abandonCount - beforeCount}) | ORPHAN dokumente files=${orphans.length} -> ${JSON.stringify(orphans)}`)
    expect(abandonCount, 'abandon leaves 0 ausgaben rows').toBe(beforeCount)
    // Regression guard for the shipped orphan-cleanup fix (discardOrphan on close/unmount):
    expect(orphans.length, 'discardOrphan→removeReceipt cleans the uploaded file on abandon (0 residue)').toBe(0)

    // (4) repeat + DO Save -> exactly 1 row, file referenced
    await page.getByRole('button', { name: 'Neue Ausgabe' }).first().click()
    await expect(dialog).toBeVisible()
    const up2 = page.waitForResponse(
      (r) => r.url().includes('/storage/v1/object/dokumente') && r.request().method() === 'POST',
      { timeout: 60_000 },
    )
    await dialog.locator('input[type=file][aria-label="Beleg hochladen"]').setInputFiles(TEST_PNG)
    await up2
    await expect(dialog.getByRole('button', { name: /^Speichern/ })).toBeEnabled({ timeout: 150_000 })
    await dialog.getByLabel(/Bezeichnung/).fill(MARKER)
    await dialog.getByLabel(/Betrag/).fill('42.50')
    // receipt-backed -> payer required; pick Bootkonto
    await dialog.getByLabel(/Bezahlt von/).selectOption('bootkonto')
    await dialog.getByRole('button', { name: /^Speichern/ }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await page.waitForTimeout(1200)

    const afterSaveCount = await ausgabenCount()
    const savedRows = await sql<{ id: string; dokument_pfad: string | null }>(
      `select id, dokument_pfad from public.ausgaben where bezeichnung='${MARKER}';`,
    )
    const afterDocs = await listDocs()
    afterDocs.filter((d) => !baseline.includes(d)).forEach((d) => { if (!created.includes(d)) created.push(d) })
    console.log(`[GATE B/J] AFTER SAVE: ausgaben=${afterSaveCount} (delta ${afterSaveCount - beforeCount}) | rows w/ marker=${savedRows.length} | dokument_pfad=${JSON.stringify(savedRows.map(r => r.dokument_pfad))}`)
    expect(savedRows.length, 'exactly 1 row saved on Speichern').toBe(1)
    expect(savedRows[0].dokument_pfad, 'saved row references the uploaded file').toBeTruthy()
    expect(afterDocs).toContain(savedRows[0].dokument_pfad)

    // ---------------------------- CLEANUP ----------------------------
    await sql(`delete from public.ausgaben where bezeichnung like '${MARKER}%';`)
    // Sweep EVERY object that appeared since baseline (robust vs created[] tracking gaps —
    // a partial/failed run must never leave residue that cascades into the next run).
    const toClean = (await listDocs()).filter((d) => !baseline.includes(d))
    const delResults: string[] = []
    for (const name of toClean) {
      const st = SVC ? await deleteStorageObject(name) : 0                                          // physical object (needs service key)
      await sql(`delete from storage.objects where bucket_id='dokumente' and name='${name}';`).catch(() => {}) // metadata row (superuser)
      delResults.push(`${name}:${st}`)
    }
    const finalCount = await ausgabenCount()
    const leftover = (await listDocs()).filter((d) => !baseline.includes(d))
    console.log(`[GATE B/J] CLEANUP: swept [${delResults.join(', ')}] | final ausgaben=${finalCount} | leftover=${JSON.stringify(leftover)}`)
    expect(finalCount, 'ausgaben restored to baseline').toBe(beforeCount)
    expect(leftover.length, 'all test storage objects removed').toBe(0)
  })

  // -------------------------- GATE K: fault-injected data loads --------------------------
  for (const mode of ['500', 'empty'] as const) {
    for (const route of ['/finanzen', '/dashboard'] as const) {
      test(`Gate K — ${route} graceful under ${mode}`, async ({ page }) => {
        await page.route(/\/rest\/v1\/.*/, (r) =>
          mode === '500'
            ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"injected"}' })
            : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' }),
        )
        await page.route(/\/rest\/v1\/rpc\/.*/, (r) =>
          mode === '500'
            ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"injected"}' })
            : r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
        )
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(e.message))
        await page.goto(route)
        await page.waitForTimeout(6000) // allow retry:1 + settle

        const heading = route === '/finanzen' ? 'Finanzen' : 'Dashboard'
        const headingVisible = await page.getByRole('heading', { name: heading }).isVisible().catch(() => false)
        // stuck-spinner check: no skeleton/pulse still animating after settle
        const pulses = await page.locator('.animate-pulse').count()
        const bodyText = (await page.locator('body').innerText().catch(() => '')).trim()
        const whiteScreen = bodyText.length < 20
        console.log(`[GATE K] ${route} ${mode}: heading=${headingVisible} pulses=${pulses} bodyLen=${bodyText.length} pageerrors=${errors.length}`)
        expect.soft(headingVisible, `${route} ${mode}: heading renders (no white screen)`).toBe(true)
        expect.soft(whiteScreen, `${route} ${mode}: not a white screen`).toBe(false)
        expect.soft(errors.length, `${route} ${mode}: no uncaught page errors`).toBe(0)
      })
    }
  }

  // -------------------------- GATE I: correctness under REAL data volume --------------------------
  // useAusgaben does `.select('*')` with no `.range()` → PostgREST silently caps at 1000 rows,
  // and FinanzenPage sums betrag over the fetched rows → a wrong total past 1000 expenses.
  // Seed >1000 and assert the app pulls them ALL (sum of every /rest/v1/ausgaben GET, so it
  // still passes once useAusgaben paginates).
  test('Gate I — Finanzen counts ALL rows past the 1000-cap (no silent truncation)', async ({ page }) => {
    test.setTimeout(120_000)
    expect(MGMT, 'BB_MGMT_TOKEN required').not.toBe('')
    // Pre-clean stale seed rows from a prior/cancelled run (shared-staging hygiene).
    await sql(`delete from public.ausgaben where bezeichnung like '${MARKER}%';`)
    const SEED = 1001

    // The Übersicht stat card renders "<n> Ausgabe(n)" = current-year filtered.length.
    // Reading the rendered COUNT is the app's own output — implementation-agnostic
    // (passes whether useAusgaben fetches in one shot or paginates), unlike summing
    // network responses which masks a per-request cap.
    const readCount = async (): Promise<number> => {
      await page.goto('/finanzen')
      await page.waitForLoadState('networkidle')
      const el = page.getByText(/^\d+\s+Ausgabe[n]?$/).first()
      await expect(el).toBeVisible({ timeout: 15_000 })
      // The count renders "0" while the ausgaben query is in flight, then updates.
      // Poll until it holds steady for 3 reads so we capture the settled value.
      let last = -1, stable = 0
      for (let i = 0; i < 25; i++) {
        const v = parseInt((await el.innerText()).trim(), 10)
        if (v === last) { if (++stable >= 3) return v } else { stable = 0; last = v }
        await page.waitForTimeout(300)
      }
      return last
    }

    const before = await readCount()
    await sql(
      `insert into public.ausgaben (bezeichnung, betrag, kategorie, datum)
       select '${MARKER}_vol', 1.00, 'sonstiges', date_trunc('year', now())::date + ((g % 300) || ' days')::interval
       from generate_series(1, ${SEED}) g;`,
    )
    const totalRows = await ausgabenCount()
    console.log(`[GATE I] seeded ${SEED} current-year rows (table total ${totalRows}; PostgREST default cap = 1000)`)

    const after = await readCount()
    console.log(`[GATE I] displayed current-year count: before=${before} after=${after} (expected ${before + SEED})`)

    // clean up BEFORE asserting so a failure never leaves 1001 seed rows on staging
    await sql(`delete from public.ausgaben where bezeichnung = '${MARKER}_vol';`)
    expect(after - before, `app must count all ${SEED} new rows, not silently cap at 1000`).toBe(SEED)
  })

  // -------------------------- GATE M: deployed-bundle identity & backend origin --------------------------
  // Proves the deployed STAGING site talks to the STAGING Supabase (and NOT prod). This is both a
  // deploy-identity check and the guard that makes the write-tests above safe: if staging were
  // accidentally built with prod env, Gate B/I would be mutating the PRODUCTION database.
  test('Gate M — staging bundle talks to the STAGING backend, never prod', async ({ page }) => {
    const PROD_REF = 'xzythvxmuxmczuiophwp'
    const hosts = new Set<string>()
    page.on('request', (r) => {
      const u = r.url()
      if (u.includes('.supabase.co')) hosts.add(new URL(u).host)
    })
    await page.goto('/finanzen')
    // Wait for the app to actually render (guarantees mount) before judging network.
    await expect(page.getByRole('heading', { name: 'Finanzen' })).toBeVisible({ timeout: 15_000 })
    // The data fetch can land after networkidle on a slow CI runner — poll for it.
    for (let i = 0; i < 25 && hosts.size === 0; i++) await page.waitForTimeout(300)
    const hostList = [...hosts]
    console.log(`[GATE M] supabase hosts contacted: ${JSON.stringify(hostList)}`)
    expect(hostList.some((h) => h.startsWith(REF)), `staging app talks to STAGING (${REF})`).toBe(true)
    expect(hostList.some((h) => h.startsWith(PROD_REF)), 'staging app must NOT touch PROD supabase').toBe(false)
    // deployed bundle is a real, mounted app (not a blank/broken deploy)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 })
  })
})

// ══════════ GATE A COVERAGE DENOMINATOR ══════════
// audit-framework.md v13.2 pins the v11 coverage manifest to `surfaces ENUMERATED [M]` +
// `surfaces DRIVEN [N of M]`, and N < M FAILS. Origin: the 2026-08-19 B4 meta-audit found
// every fleet harness driving 1-3 hand-picked modals while its report published "Gates A-M
// ALL PASS".
//
// N is no longer a hand-typed array. It is computed from the crawl manifest written by the
// step that runs immediately before this one: a file counts only when the crawl OPENED a
// dialog carrying that file's declared data-gate-a id. Roger's rule, 2026-08-21: "they cannot
// stay green unless it has really opened".
import { gateACoverage, formatCoverage } from '@predivo-gmbh/gate-kit/conformance'

/** Surfaces unreachable BY DESIGN. Each needs a reason, and a dated one expires. */
const ACCEPTED_UNREACHABLE: { file: string; reason: string; expires?: string }[] = []

test('Gate A — coverage denominator (surfaces enumerated vs actually opened)', async () => {
  const fs = await import('node:fs')
  const manifestPath = 'playwright/.gate-a/crawl-manifest.json'
  expect(
    fs.existsSync(manifestPath),
    'no crawl manifest: the Gate A crawl step must run BEFORE this gate, or its result is stale',
  ).toBe(true)

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const cov = gateACoverage({ repo: process.cwd(), roots: ['src'], manifest, accepted: ACCEPTED_UNREACHABLE })
  console.log(formatCoverage(cov))

  expect(cov.staleAccepted, 'accepted-unreachable entries for files that are no longer dialogs').toEqual([])
  expect(
    cov.unprovable.map((u) => u.file),
    'dialog files that declare no data-gate-a id, so nothing can prove whether they were opened',
  ).toEqual([])
  expect(
    cov.undriven.map((u) => u.file),
    `Gate A opened ${cov.N} of ${cov.M} dialog surfaces. A surface that was never opened is not covered: ` +
      `make the crawl reach it, or record it in ACCEPTED_UNREACHABLE with a reason.`,
  ).toEqual([])
})
