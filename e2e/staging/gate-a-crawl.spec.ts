/**
 * Gate A runtime crawl. THIS FILE IS THIN ON PURPOSE.
 *
 * The machinery lives in @predivo-gmbh/gate-kit/crawl: one implementation for the whole fleet,
 * with its own fixture suite covering every way this crawler has actually lied (a modal counted
 * 35 times, an auto-opening modal it could never reach, a route crawled blind behind an
 * undismissable overlay, discovery that only ran at desktop width, a trigger whose accessible
 * name it could not resolve). What belongs here is only what is different about THIS product,
 * and that all lives in gate-a.config.ts.
 *
 * The previous 550-line copy of the machinery is gone. It had the same two defects the other
 * five copies had, which is the whole argument for there being one of it.
 */
import { test, expect } from '@playwright/test'
import { runGateACrawl, assertGateA, formatManifest, writeManifest } from '@predivo-gmbh/gate-kit/crawl'
import { checkRouteCoverage, checkRegisterExpiry } from '@predivo-gmbh/gate-kit/conformance'
import config, { declaredRoutes, routeExclusions } from './gate-a.config'

test.describe('Gate A - runtime crawl', () => {
  test.describe.configure({ mode: 'serial' })

  test('discover every dialog by driving the app, then assert reachability on each', async ({ page }) => {
    test.setTimeout(1_800_000)

    const result = await runGateACrawl(page, config)
    console.log(formatManifest(result))
    await writeManifest(result, 'playwright/.gate-a/crawl-manifest.json')

    // ANTI-ROT: the route list is derived from this app's own router, and every declared route
    // must be swept or excluded WITH A REASON. A new route that nobody classifies fails here by
    // name, instead of silently never being crawled.
    const routes = checkRouteCoverage({
      declared: declaredRoutes(),
      swept: config.routes,
      exclusions: routeExclusions,
    })
    expect(routes.unexplained, 'routes the router declares that are neither swept nor excluded').toEqual([])
    expect(routes.staleExclusions, 'exclusions for routes that no longer exist').toEqual([])
    expect(routes.exclusionsWithoutReason, 'every exclusion needs a reason').toEqual([])

    // A bound nobody re-justifies is a blind spot, so exclusions with a deadline expire.
    const register = checkRegisterExpiry(
      routeExclusions.filter((e) => e.expires).map((e) => ({ id: e.route, expires: e.expires })),
      new Date().toISOString().slice(0, 10),
    )
    expect(register.expired, 'Accepted-Risk entries past their date').toEqual([])

    assertGateA(result, expect)
  })
})
