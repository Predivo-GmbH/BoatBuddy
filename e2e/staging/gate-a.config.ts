/**
 * BoatBuddy's Gate A config. Everything here is product-specific; the machinery lives in
 * @predivo-gmbh/gate-kit/crawl and is shared by the whole fleet.
 *
 * AUTH MODEL: no user login at all. Staging sits behind HTTP basic auth (handled in
 * playwright.gate-a-crawl.config.ts), and the app itself is behind a PasswordGate whose unlock
 * flag is sessionStorage['boatbuddy-unlocked'] (src/components/shared/PasswordGate.tsx:5).
 *
 * SAFETY: the denylist is EVIDENCE, not a guess. A reconnaissance pass that clicked NOTHING
 * enumerated every visible trigger on all eight routes at both discovery widths: 143 trigger
 * instances, 62 distinct accessible names. This app's create/edit triggers were then traced to
 * source and are PURE STATE SETTERS that open a dialog and write nothing. Commit controls
 * inside a discovered dialog are MEASURED, NEVER CLICKED.
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import type { Page } from '@playwright/test'
import { routesFromReactRouter } from '@predivo-gmbh/gate-kit/conformance'
import type { GateAConfig } from '@predivo-gmbh/gate-kit/crawl'

const STAGING_URL = process.env.STAGING_URL || 'https://staging.boatbuddy.predivo.ch'

const routeData = JSON.parse(
  fs.readFileSync(path.resolve('e2e/staging/gate-a-routes.json'), 'utf8'),
) as { swept: string[]; exclusions: { route: string; reason: string; expires?: string }[]; routerSources: string[] }

/** Derived from the app's own router, so a new route cannot be silently left uncrawled. */
export function declaredRoutes(): string[] {
  return [
    ...new Set(
      routeData.routerSources.flatMap((src) =>
        routesFromReactRouter(fs.readFileSync(path.resolve(src), 'utf8'), { ts }),
      ),
    ),
  ]
}

export const routeExclusions = routeData.exclusions

async function unlock(page: Page) {
  // Set on EVERY document, because the crawl re-navigates constantly and a fresh document
  // would otherwise land back on the PasswordGate.
  await page.addInitScript(() => {
    sessionStorage.setItem('boatbuddy-unlocked', 'true')
  })
  await page.goto(STAGING_URL)
  await page.evaluate(() => {
    sessionStorage.setItem('boatbuddy-unlocked', 'true')
  })
}

const config: GateAConfig = {
  baseURL: STAGING_URL,

  identities: [{ key: 'base', label: 'password gate only, no user session', setup: unlock }],

  routes: routeData.swept,

  deny: {
    // Destructive or off-site. German first, since this UI is German.
    destructive:
      /(lösch|entfern|delete|remove|abmelden|log\s?out|sign\s?out|export|import|download|hochladen|upload|senden|versend|teilen|bezahl|checkout)/i,
    // Never a valid TRIGGER: a page-level commit control.
    nonTrigger: /^(speichern|save|absenden|submit)$/i,
    // OVERRIDE, with proof. Every delete TRIGGER in this app is `onClick={() => setDeleteId(x)}`,
    // a pure state setter that renders ConfirmDialog and mutates nothing; the mutation lives in
    // that dialog's onConfirm, which Gate A measures and never clicks. All eight are listed with
    // file and line in gate-a-openers.md. Without this override the shared ConfirmDialog is
    // never opened by anything, and a surface that is never opened cannot be called covered.
    allowOpeners: /löschen$/i,
  },

  commit:
    /^(speichern|save|erstellen|create|hinzufügen|add|eintragen|erfassen|bestätigen|confirm|übernehmen|apply|aktualisieren|update|weiter|continue|next|fertig|done|ok)\b/i,

  /**
   * A run without a satisfied control assertion is not a result. Each of these names a surface
   * KNOWN to exist and each covers a different way this crawl has actually died.
   */
  controls: [
    {
      name: 'Ferien dialog ("Ferien eintragen" on /kalender) - proves the PasswordGate unlock worked',
      match: (s) => s.route === '/kalender' && /^ferien eintragen$/i.test(s.trigger),
    },
    {
      name: 'a mobile-only surface was reached - proves discovery still runs at a MOBILE width',
      match: (s) => s.width === 'mobile',
    },
    {
      name: 'a multi-element card button was driven - proves accessible names are collected with innerText',
      match: (s) => /\s/.test(s.trigger) && s.trigger.split(/\s+/).length >= 3,
    },
  ],
}

export default config
