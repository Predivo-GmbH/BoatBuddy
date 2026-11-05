import type { Page } from '@playwright/test'
// The helper is Node-only. No service credentials cross into the page.
// @ts-expect-error Node .mjs fixture helper has no declaration file
import { memberSessionForPage, STAGING_REF } from '../scripts/lib/staging-member.mjs'

// One verification per worker, a renewal per further browser context, nothing for a page that
// is signed in already: memberSessionForPage explains why (Supabase's verification limit ran
// Critical Path Tests dry after ~60 sign-ins, run 41931476724).
export async function signInMember(page: Page) {
  const session = await memberSessionForPage(page)
  if (session) {
    await page.addInitScript(({ key, value }) => {
      // Write once per tab; otherwise every navigation replays an already-rotated
      // refresh token and invalidates the session during a long Gate A crawl.
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value)
    }, { key: `sb-${STAGING_REF}-auth-token`, value: JSON.stringify(session) })
  }
  await page.goto('/dashboard')
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor()
}
