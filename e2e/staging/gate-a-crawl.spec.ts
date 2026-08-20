/**
 * gate-a-crawl.spec.ts - runtime discovery for v11 Gate A. Ported from ReplyFlow,
 * BackOffice, ChannelMover, Valrano and SignalScore (2026-08-20), where it was proven
 * first. Only the auth block, the route list, the denylists and the controls differ.
 *
 * WHY THIS EXISTS
 * Gate A asks one question: at a short or narrow viewport, can the user actually REACH the
 * commit control inside every modal? Gate A was WRITTEN after this very product shipped a
 * dialog whose Save button sat below the fold with no internal scroller, and a full audit
 * passed it anyway. The 2026-08-19 B4 meta-audit then found the gate itself pointed at
 * hand-picked modals: BoatBuddy drove 3 of 9 dialog-class surfaces while its report
 * published "Gate A: PASS". The hand-written list IS the defect.
 *
 * AUTH: there is no user login here. Everything sits behind HTTP basic auth plus a
 * PasswordGate whose unlock flag is sessionStorage['boatbuddy-unlocked']
 * (src/components/shared/PasswordGate.tsx:5), set the same way
 * e2e/staging/v11-gates.spec.ts:55 already does.
 *
 * SAFETY - the denylist is EVIDENCE, not a guess. A reconnaissance pass that clicked
 * NOTHING enumerated every visible trigger on all eight routes at both discovery widths:
 * 143 trigger instances, 62 distinct accessible names. This app's create/edit triggers were
 * then traced to source and are PURE STATE SETTERS that open a dialog and write nothing:
 * KalenderPage.tsx:42 (setShowFerienDialog), KalenderRaster.tsx:105 (onDayClick ->
 * setSelectedDate), KalenderPage.tsx:118,172. So they are driven on purpose: they are
 * exactly the surfaces Gate A exists to measure. Only genuinely destructive or off-site
 * names are denied. Commit controls inside a discovered dialog are MEASURED, NEVER CLICKED.
 *
 * BLOCKING RULE: every crawl result must carry a CONTROL ASSERTION that a KNOWN surface was
 * found. A crawl that finds nothing, or only what opens by itself, is a BROKEN HARNESS,
 * never a clean app.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const STAGING_URL = process.env.STAGING_URL || 'https://staging.boatbuddy.predivo.ch'

type Identity = { key: string; email: string; routes?: string[] }
const IDENTITIES: Identity[] = [{ key: 'base', email: '(password gate only)' }]

/** Every route in src/App.tsx:38-50, including the public /phone-upload. */
const ROUTES = [
  '/dashboard',
  '/finanzen',
  '/kalender',
  '/gastsessions',
  '/nutzung',
  '/boot',
  '/neuigkeiten',
  '/phone-upload',
]

/**
 * Discovery widths - NOT the Gate A measurement matrix below. This is about which triggers
 * EXIST at all: a surface hidden above a breakpoint does not exist at 1280px. Discovering
 * only at desktop width hid real bugs in ReplyFlow, Valrano and SignalScore, all three of
 * which left controls unreachable on a short mobile screen.
 */
const DISCOVERY_WIDTHS = [
  { name: 'desktop', w: 1280, h: 900 },
  { name: 'mobile', w: 390, h: 844 },
]

/** Never clicked: destructive or off-site. German first, since this UI is German. */
const HARD_DENY =
  /(lösch|entfern|delete|remove|abmelden|log\s?out|sign\s?out|export|import|download|hochladen|upload|senden|versend|teilen|bezahl|checkout)/i

/** Not destructive, but never a valid TRIGGER: a page-level commit control. */
const NON_TRIGGER_DENY = /^(speichern|save|absenden|submit)$/i

/** No denylist overrides are justified here yet; every entry must carry source proof. */
const ALLOW_OPENERS = /^(?!)$/

/** Commit-control names, per the framework's Gate A locate rule (German + English). */
const COMMIT =
  /^(speichern|save|erstellen|create|hinzufügen|add|eintragen|erfassen|bestätigen|confirm|übernehmen|apply|aktualisieren|update|weiter|continue|next|fertig|done|ok)\b/i

/** Framework Gate A matrix + the v13.3 #31 desktop-short additions. */
const VIEWPORTS = [
  { name: '375x667 portrait', w: 375, h: 667 },
  { name: '375x360 kb-open', w: 375, h: 360 },
  { name: '812x375 landscape', w: 812, h: 375 },
  { name: '667x375 landscape', w: 667, h: 375 },
  { name: '1280x600 desktop-short', w: 1280, h: 600 },
  { name: '1024x576 scaled-laptop', w: 1024, h: 576 },
]

/**
 * App-shell memo - the only bound on coverage here, and it is LOGGED. The sidebar and
 * header repeat on every route; without this each is re-clicked 12 routes x 3 identities.
 * A name is retired only on EVIDENCE: it opened an ALREADY-KNOWN dialog, or it opened
 * nothing on NO_OP_ROUTES distinct routes. Both are printed in the manifest, so the
 * coverage cost of the bound stays visible instead of being banked as "we covered it all".
 */
const NO_OP_ROUTES = 3

type Reach = {
  rectTop: number
  rectBottom: number
  vh: number
  inViewport: boolean
  visible: boolean
  hitOk: boolean
  hitTag: string | null
}

/** No user session exists in this product; the only gate is the PasswordGate flag. */
async function userSession() {
  return null
}

/**
 * Unlock the PasswordGate. addInitScript runs before every page load, so the flag is set
 * before any React code evaluates the gate, and it survives the re-navigations the crawl
 * performs on every route reset. Mirrors e2e/staging/v11-gates.spec.ts:55.
 */
async function inject(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('boatbuddy-unlocked', 'true')
  })
  await page.goto(STAGING_URL)
  await page.evaluate(() => {
    sessionStorage.setItem('boatbuddy-unlocked', 'true')
  })
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(700)
}

async function enterRoute(page: Page, route: string) {
  await page.goto(`${STAGING_URL}${route}`, { waitUntil: 'domcontentloaded' })
  await settle(page)
}

/** Is the browser still on `route`? Query is compared only when the route pins one. */
function onRoute(url: string, route: string): boolean {
  const now = new URL(url)
  const want = new URL(route, STAGING_URL)
  if (now.pathname !== want.pathname) return false
  for (const [k, v] of want.searchParams) if (now.searchParams.get(k) !== v) return false
  return true
}

async function measure(el: Locator): Promise<Reach> {
  return el.evaluate((node: Element) => {
    const r = node.getBoundingClientRect()
    const vh = window.visualViewport?.height ?? window.innerHeight
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const hit = document.elementFromPoint(cx, cy)
    const he = node as HTMLElement
    return {
      rectTop: Math.round(r.top),
      rectBottom: Math.round(r.bottom),
      vh: Math.round(vh),
      inViewport: r.bottom <= vh + 0.5 && r.top >= -0.5,
      visible: he.offsetParent !== null && r.width > 0 && r.height > 0,
      hitOk: hit === node || node.contains(hit) || (!!hit && hit.contains(node)),
      hitTag: hit ? hit.tagName.toLowerCase() : null,
    }
  })
}

/** v13.2: the scroll allowance is admissible only inside a REAL overflowing ancestor. */
async function scrollerAncestor(el: Locator): Promise<string | null> {
  return el.evaluate((node: Element) => {
    let n: Element | null = node.parentElement
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
}

/** Pick the commit control per the framework rule: named match, else last ENABLED button. */
async function commitControl(dialog: Locator): Promise<{ el: Locator; how: string } | null> {
  const named = dialog.getByRole('button', { name: COMMIT })
  if ((await named.count()) > 0) return { el: named.last(), how: 'named' }
  const enabled = dialog.locator('button:not([disabled])')
  if ((await enabled.count()) === 0) {
    // Distinguish "no commit control" from "nothing to commit". A popover with NO
    // interactive descendants at all (Valrano's notifications panel: zero buttons, zero
    // links, text "No notifications yet") has no commit control BY CONSTRUCTION, and
    // reporting that as a Gate A failure is a false positive - which is how a gate stops
    // being read. Absence is PROVEN from the DOM here, never assumed. A dialog that HAS
    // controls but none matching COMMIT still fails to locate below: that is the dangerous
    // case (an i18n-labelled Save), and it must stay red.
    const interactive = await dialog.locator('button, a[href], input, select, textarea, [role="button"]').count()
    if (interactive === 0) return { el: dialog, how: 'INERT' }
    return null
  }
  return { el: enabled.last(), how: 'last-enabled(heuristic)' }
}

type Finding = { surface: string; route: string; viewport: string; detail: string }

async function assertReachable(
  dialog: Locator,
  surface: string,
  route: string,
  page: Page,
  findings: Finding[],
) {
  const cc = await commitControl(dialog)
  if (cc && cc.how === 'INERT') {
    console.log('    (inert popover: zero interactive controls in the DOM, nothing to commit)')
    return
  }
  if (!cc) {
    // Framework: a null/ambiguous commit control is a FAIL to locate, never "N/A".
    findings.push({ surface, route, viewport: '-', detail: 'no commit control could be located' })
    return
  }
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h })
    await page.waitForTimeout(200)

    // A responsive surface may not EXIST at every width. A drawer hidden above a
    // breakpoint unmounts when the matrix widens, and the commit-control locator resolves
    // to nothing. With Playwright's default actionTimeout of 0, that measurement then waits
    // for the WHOLE test timeout - an hour of a hung job that looks like a slow crawl.
    // Absence is PROVEN here (the node is gone from the DOM), not assumed, so it is
    // recorded as not-rendered rather than counted as a reachability failure.
    if ((await cc.el.count()) === 0 || !(await cc.el.isVisible().catch(() => false))) {
      console.log(`    ${vp.name.padEnd(22)} not rendered at this width (surface is responsive - absence verified in DOM)`)
      continue
    }
    let m = await measure(cc.el)
    let reachable = m.inViewport && m.visible
    let viaScroll = false
    let scroller: string | null = null
    if (!reachable) {
      scroller = await scrollerAncestor(cc.el)
      if (scroller) {
        await cc.el.scrollIntoViewIfNeeded().catch(() => {})
        await page.waitForTimeout(150)
        const m2 = await measure(cc.el)
        if (m2.inViewport && m2.visible) {
          m = m2
          reachable = true
          viaScroll = true
        }
      }
    }
    console.log(
      `    ${vp.name.padEnd(22)} reachable=${String(reachable).padEnd(5)}` +
        `${viaScroll ? `(scroll:${scroller})` : ''} hit=${m.hitOk} top=${m.rectTop} bottom=${m.rectBottom} vh=${m.vh}`,
    )
    if (!reachable) {
      findings.push({
        surface,
        route,
        viewport: vp.name,
        detail: `commit control NOT reachable (bottom=${m.rectBottom} vh=${m.vh}, scrollerAncestor=${scroller ?? 'NONE'})`,
      })
    } else if (!m.hitOk) {
      findings.push({
        surface,
        route,
        viewport: vp.name,
        detail: `commit control occluded at the hit point (topmost element = <${m.hitTag}>)`,
      })
    }
  }
}

const DIALOG_SEL = '[role="dialog"], [aria-modal="true"]'

/**
 * Controls that only CLOSE what is on screen. Escape is not enough on this product: the
 * YouTube "Authorization Required" modal auto-opens on /settings and survives three
 * Escapes (verified 2026-08-20), and a modal left open eats every later click on the route.
 *
 * Deliberately excludes "Do this later", which is also on that modal: it persists a
 * dismissal for the account, so it would change state for every later run instead of just
 * closing the dialog. Closing is allowed; remembering that you closed it is not.
 */
const DISMISS = /^(close|cancel|dismiss|not now|schliessen|schließen|abbrechen|×|✕|x)$/i

/** Try Escape, then a pure close control INSIDE the dialog. Returns true if it cleared. */
async function tryDismiss(page: Page): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    if (!(await dialogFingerprint(page))) return true
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(350)
  }
  if (!(await dialogFingerprint(page))) return true
  const dialog = page.locator(DIALOG_SEL).first()
  const closer = dialog.getByRole('button', { name: DISMISS }).first()
  if ((await closer.count()) > 0) {
    await closer.click({ timeout: 2500 }).catch(() => {})
    await page.waitForTimeout(600)
  }
  return !(await dialogFingerprint(page))
}

/** Fingerprint of the dialog currently on screen, or null. A trigger discovery is only
 *  real if this CHANGED across the click - otherwise one modal counts itself N times. */
async function dialogFingerprint(page: Page): Promise<string | null> {
  const d = page.locator(DIALOG_SEL).first()
  if ((await d.count()) === 0) return null
  if (!(await d.isVisible().catch(() => false))) return null
  return d
    .evaluate((el) => {
      const h = el.querySelector('h1,h2,h3,[role="heading"]')
      const head = (h?.textContent || '').trim().slice(0, 60)
      const btns = [...el.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).join('|').slice(0, 120)
      return `${head} :: ${btns}`
    })
    .catch(() => null)
}

type Sighting = {
  identity: string
  route: string
  width: string
  trigger: string
  fingerprint: string
  isNew: boolean
}

/**
 * CONTROL ASSERTIONS - the harness's own smoke test (blocking rule above). Each names a
 * surface KNOWN to exist, and each covers a different way this crawler has actually died.
 * A control may be satisfied by a DUPLICATE sighting: a dup means it WAS found, then
 * collapsed into an earlier fingerprint.
 */
const CONTROLS: { name: string; match: (s: Sighting) => boolean }[] = [
  {
    // Verified by hand 2026-08-20 with a route reset before the click: "Ferien eintragen"
    // on /kalender opens a real dialog (KalenderPage.tsx:42, a pure setState). Proves the
    // PasswordGate unlock worked and that a trigger-driven modal can be opened.
    name: 'Ferien dialog ("Ferien eintragen" on /kalender)',
    match: (s) => s.route === '/kalender' && /^ferien eintragen$/i.test(s.trigger),
  },
  {
    // Proves discovery still runs at a MOBILE width. That blind spot hid a real bug in
    // three other products on the same day, every one of them a panel with no scroller
    // whose controls fell off a short screen.
    name: 'a mobile-only surface was reached (mobile discovery width is live)',
    match: (s) => s.width === 'mobile',
  },
]

test.describe('Gate A - runtime crawl', () => {
  test.describe.configure({ mode: 'serial' })

  test('discover every dialog by driving the app, then assert reachability on each', async ({ page }) => {
    test.setTimeout(3_600_000)
    // No Supabase key needed here: this product has no user login. The only precondition
    // is HTTP basic auth (supplied by the config) plus the PasswordGate unlock in inject().

    const sightings: Sighting[] = []
    const findings: Finding[] = []
    const skipped: string[] = []
    const blockedRoutes: string[] = []
    const seenFingerprints = new Map<string, string>()
    const shellRetired = new Map<string, string>()
    const noOpRoutes = new Map<string, Set<string>>()

    for (const identity of IDENTITIES) {
      await page.setViewportSize({ width: 1280, height: 900 })
      await userSession()
      await inject(page)
      console.log(`\n  [gateA] === identity: ${identity.key} (${identity.email})`)

      for (const route of identity.routes ?? ROUTES) {
        /** Names already clicked for this route, so the mobile pass only drives the DELTA. */
        const clickedHere = new Set<string>()
        const routeStarted = Date.now()

        for (const dw of DISCOVERY_WIDTHS) {
          await page.setViewportSize({ width: dw.w, height: dw.h })
          await enterRoute(page, route)

          // An auto-opening modal is a Gate A SURFACE, not an obstacle. TrialStartGate is
          // never behind a trigger, so skipping these (as v2 did) made it undiscoverable
          // by construction. Measure it once, then treat the route as blocked for clicking.
          const onEntry = await dialogFingerprint(page)
          if (onEntry) {
            const surface = `${identity.key} ${route} [${dw.name}] :: (auto-open)`
            const isNew = !seenFingerprints.has(onEntry)
            sightings.push({ identity: identity.key, route, width: dw.name, trigger: '(auto-open)', fingerprint: onEntry, isNew })
            if (isNew) {
              seenFingerprints.set(onEntry, surface)
              console.log(`\n  [gateA] DISCOVERED ${surface}   [auto-opening modal]`)
              await assertReachable(page.locator(DIALOG_SEL).first(), surface, route, page, findings)
              await page.setViewportSize({ width: dw.w, height: dw.h })
              await enterRoute(page, route)
            }
            // Can it be dismissed? If not, clicking anything else on this route is garbage.
            if (!(await tryDismiss(page))) {
              blockedRoutes.push(`${identity.key} ${route} [${dw.name}]  (auto-open modal will not dismiss, even via a close control: ${onEntry.slice(0, 50)})`)
              continue
            }
          }

          // Snapshot candidate triggers ONCE per route+width, by accessible name, so the
          // list is stable even though clicking re-renders the page.
          const names: string[] = await page
            .locator('button:visible, [role="button"]:visible')
            .evaluateAll((els) =>
              els
                .map((e) => (e.textContent || (e as HTMLElement).getAttribute('aria-label') || '').trim())
                .filter((t) => t.length > 0 && t.length < 60),
            )

          for (const name of [...new Set(names)]) {
            if (clickedHere.has(name)) continue // already driven at the other width
            const allowed = ALLOW_OPENERS.test(name)
            if (!allowed && HARD_DENY.test(name)) {
              skipped.push(`${identity.key} ${route} :: ${name}   [destructive]`)
              clickedHere.add(name)
              continue
            }
            if (!allowed && NON_TRIGGER_DENY.test(name)) {
              skipped.push(`${identity.key} ${route} :: ${name}   [page-level commit control]`)
              clickedHere.add(name)
              continue
            }
            if (shellRetired.has(name)) continue
            clickedHere.add(name)

            // HARD RESET before every click. Escape is NOT trusted: a modal that will not
            // close leaves an overlay that eats every later click on the route - that one
            // failure mode capped the v2 crawl at a single dialog while it reported PASS.
            if (!onRoute(page.url(), route) || (await dialogFingerprint(page)) !== null) {
              await page.setViewportSize({ width: dw.w, height: dw.h })
              await enterRoute(page, route)
            }

            const trigger = page.getByRole('button', { name, exact: true }).first()
            if ((await trigger.count()) === 0) continue
            if (!(await trigger.isVisible().catch(() => false))) continue

            const before = await dialogFingerprint(page)
            await trigger.click({ timeout: 2500 }).catch(() => {})
            await page.waitForTimeout(800)
            const after = await dialogFingerprint(page)

            if (after === null || before === after) {
              const seenOn = noOpRoutes.get(name) ?? new Set<string>()
              seenOn.add(route)
              noOpRoutes.set(name, seenOn)
              if (seenOn.size >= NO_OP_ROUTES) {
                shellRetired.set(name, `opened nothing on ${seenOn.size} routes (${[...seenOn].join(', ')})`)
              }
              continue
            }

            const surface = `${identity.key} ${route} [${dw.name}] :: ${name}`
            const isNew = !seenFingerprints.has(after)
            sightings.push({ identity: identity.key, route, width: dw.name, trigger: name, fingerprint: after, isNew })

            if (!isNew) {
              console.log(`  [gateA] dup       ${surface}  ->  ${seenFingerprints.get(after)}`)
              shellRetired.set(name, `app-shell dialog, already measured at ${seenFingerprints.get(after)}`)
              await enterRoute(page, route)
              continue
            }
            seenFingerprints.set(after, surface)
            console.log(`\n  [gateA] DISCOVERED ${surface}`)
            await assertReachable(page.locator(DIALOG_SEL).first(), surface, route, page, findings)

            await page.setViewportSize({ width: dw.w, height: dw.h })
            await enterRoute(page, route)
          }
        }
        // Pace, printed per route. A crawl that goes quiet for ten minutes is
        // indistinguishable from a hung one, and a hung crawl that hits the job timeout
        // loses its whole manifest.
        console.log(`  [gateA] ---- ${identity.key} ${route} swept in ${Math.round((Date.now() - routeStarted) / 1000)}s (${clickedHere.size} triggers)`)
      }
    }

    const discovered = sightings.filter((s) => s.isNew)
    const dupes = sightings.filter((s) => !s.isNew)
    const missingControls = CONTROLS.filter((c) => !sightings.some((s) => c.match(s)))

    console.log(
      [
        '',
        'GATE A RUNTIME CRAWL MANIFEST (v13.3)',
        `  identities crawled      = ${IDENTITIES.length}  (${IDENTITIES.map((i) => i.key).join(', ')})`,
        `  routes swept per identity = ${IDENTITIES.map((i) => `${i.key}:${(i.routes ?? ROUTES).length}`).join('  ')}   (of ${ROUTES.length} total)  x ${DISCOVERY_WIDTHS.length} discovery widths (${DISCOVERY_WIDTHS.map((d) => `${d.name} ${d.w}px`).join(', ')})`,
        ...IDENTITIES.filter((i) => i.routes).map((i) => `    (bounded) ${i.key} sweeps only: ${i.routes!.join(', ')}`),
        `  dialogs DISCOVERED      = ${discovered.length}`,
        ...discovered.map((d) => `    - ${d.identity} ${d.route} [${d.width}] :: ${d.trigger}   [${d.fingerprint.slice(0, 50)}]`),
        `  routes entered with an UNDISMISSABLE modal (not crawled further) = ${blockedRoutes.length}`,
        ...blockedRoutes.map((b) => `    (blocked) ${b}`),
        `  triggers that revealed an ALREADY-SEEN dialog = ${dupes.length}`,
        ...dupes.map((d) => `    (dup) ${d.identity} ${d.route} :: ${d.trigger}`),
        `  triggers skipped (denylist, never clicked) = ${skipped.length}`,
        ...skipped.map((s) => `    (deny) ${s}`),
        `  app-shell names RETIRED after being driven (bound on coverage) = ${shellRetired.size}`,
        ...[...shellRetired].map(([n, why]) => `    (retired) ${n} - ${why}`),
        `  CONTROL surfaces satisfied = ${CONTROLS.length - missingControls.length} of ${CONTROLS.length}`,
        ...CONTROLS.map((c) => `    [${sightings.some((s) => c.match(s)) ? 'ok' : 'MISSING'}] ${c.name}`),
        `  reachability findings   = ${findings.length}`,
        ...findings.map((f) => `    ! ${f.surface} @ ${f.viewport}: ${f.detail}`),
        '',
      ].join('\n'),
    )

    // Machine-readable manifest so the v11 coverage-denominator test can report what was
    // ACTUALLY driven instead of a hand-typed array that nobody remembers to update.
    const out = path.resolve(process.cwd(), 'playwright/.gate-a')
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(
      path.join(out, 'crawl-manifest.json'),
      JSON.stringify(
        {
          identities: IDENTITIES.map((i) => i.key),
          routes: ROUTES,
          discoveryWidths: DISCOVERY_WIDTHS.map((d) => d.name),
          discovered: discovered.map((d) => ({ identity: d.identity, route: d.route, width: d.width, trigger: d.trigger, fingerprint: d.fingerprint })),
          dupes: dupes.length,
          denied: skipped,
          retired: [...shellRetired].map(([n, why]) => ({ name: n, why })),
          blockedRoutes,
          findings,
        },
        null,
        2,
      ),
    )

    expect(
      discovered.length,
      'crawler discovered no dialogs at all - treat as harness failure, not a pass',
    ).toBeGreaterThan(0)

    expect(
      missingControls.map((c) => c.name),
      'CONTROL SURFACE(S) NOT FOUND - the crawl is broken; its green result means nothing',
    ).toEqual([])

    expect(
      findings,
      `Gate A reachability failures across ${discovered.length} discovered dialogs`,
    ).toEqual([])
  })
})
