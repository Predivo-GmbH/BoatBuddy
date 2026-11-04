import type { Page } from '@playwright/test'
// The helper is Node-only. No service credentials cross into the page.
// @ts-expect-error Node .mjs fixture helper has no declaration file
import { stagingMemberSession, STAGING_REF } from '../scripts/lib/staging-member.mjs'

export async function signInMember(page: Page) {
  const { session } = await stagingMemberSession(process.env, { fresh: true })
  await page.addInitScript(({ key, value }) => {
    // Write once per tab; otherwise every navigation replays an already-rotated
    // refresh token and invalidates the session during a long Gate A crawl.
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value)
  }, { key: `sb-${STAGING_REF}-auth-token`, value: JSON.stringify(session) })
  await page.goto('/dashboard')
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor()
}
