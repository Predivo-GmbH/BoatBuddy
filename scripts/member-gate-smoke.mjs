#!/usr/bin/env node
// Release smoke for the member sign-in (2026-11-04, review of PR #38).
//
// Posts a RANDOM WRONG password to the deployed member-session function and requires
// HTTP 401 ("Falsches Passwort"). That one answer proves the function is deployed, has
// its password hash secret, reached its rate counter and compared the password. A 503
// means it is misconfigured: every member would be locked out by the new front end. The
// deploy jobs run this AFTER the edge functions and BEFORE the FTP upload, so a broken
// sign-in stops the release while the old front end is still the one live.
//
// It never sends or knows the real password. One wrong attempt per run counts toward
// the runner IP's 10-per-15-minutes budget and the 60-per-hour wrong-password budget.
//
//   node scripts/member-gate-smoke.mjs --environment staging|production
//   env: SUPABASE_PUBLIC_KEY (that project's publishable/anon key, a public value)
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const PROJECTS = Object.freeze({
  staging: 'svpewgbwousyheohlrtt',
  production: 'xzythvxmuxmczuiophwp',
})

export async function smoke(environment, { publicKey, fetchImpl = fetch, attempts = 3, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (!Object.hasOwn(PROJECTS, environment)) throw new Error('Choose --environment staging or production')
  if (!publicKey) throw new Error('SUPABASE_PUBLIC_KEY is required')
  const url = `https://${PROJECTS[environment]}.supabase.co/functions/v1/member-session`
  let last = 'no answer'
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { apikey: publicKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: `release-smoke-wrong-${randomUUID()}` }),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      last = 'unreachable'
      if (attempt < attempts) await wait(10_000)
      continue
    }
    await response.body?.cancel()
    if (response.status === 401) return { ok: true, status: 401 }
    last = `HTTP ${response.status}`
    // A cold start or a gateway blip can answer 5xx once; a 429 or 503 that persists is real.
    if (response.status >= 500 && attempt < attempts) { await wait(10_000); continue }
    break
  }
  throw new Error(`${environment} member-session answered ${last} to a wrong password; expected 401. ` +
    'The sign-in is broken (503 = missing hash secret, member identity or rate counter). Release stopped before the front end upload.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--environment')
  smoke(index >= 0 ? process.argv[index + 1] : undefined, { publicKey: process.env.SUPABASE_PUBLIC_KEY })
    .then(() => console.log('member-session refuses a wrong password with 401: sign-in is configured'))
    .catch(error => { console.error(`::error::${error.message}`); process.exitCode = 1 })
}
