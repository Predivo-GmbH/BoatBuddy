#!/usr/bin/env node
// Release smoke for the member sign-in (2026-11-04, reviews of PR #38).
//
// Against the deployed member-session function, in this order:
// 1. a RANDOM WRONG password must answer HTTP 401 ("Falsches Passwort");
// 2. the REAL shared password must answer HTTP 200 with a short native session;
// 3. that session is signed out at once (`/auth/v1/logout?scope=local`: only THIS session,
//    never the other devices of the shared member identity), so the run leaves nothing behind.
// Together that proves the function is deployed, has the right hash secret, reaches its
// rate counter, compares the password and can issue a session. A 503 means it is
// misconfigured: every member would be locked out by the new front end. The deploy jobs run
// this AFTER the edge functions and BEFORE the FTP upload, so a broken sign-in stops the
// release while the old front end is still the one live.
//
// The real password comes from the MEMBER_GATE_PASSWORD secret via the environment. It is
// never printed, logged or put into an error message, and neither is any token. A missing
// secret FAILS the step (it never skips). One run spends one wrong attempt of the 60-per-hour
// wrong-password budget and two attempts of the runner address's 10 per 15 minutes.
//
//   node scripts/member-gate-smoke.mjs --environment staging|production
//   env: SUPABASE_PUBLIC_KEY (that project's publishable/anon key, a public value)
//        MEMBER_GATE_PASSWORD (the shared member password, a secret)
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const PROJECTS = Object.freeze({
  staging: 'svpewgbwousyheohlrtt',
  production: 'xzythvxmuxmczuiophwp',
})
const ACCESS_SECONDS = 900

/** One call with retries on network errors and 5xx (a cold start or gateway blip). Never throws. */
async function call(fetchImpl, url, init, { attempts, wait }) {
  let last = { status: 0, label: 'unreachable', body: null }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response
    try {
      response = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000) })
    } catch {
      last = { status: 0, label: 'unreachable', body: null }
      if (attempt < attempts) await wait(10_000)
      continue
    }
    let body = null
    try { body = await response.json() } catch { /* the status alone decides */ }
    last = { status: response.status, label: `HTTP ${response.status}`, body }
    if (response.status >= 500 && attempt < attempts) { await wait(10_000); continue }
    break
  }
  return last
}

function isShortSession(body) {
  return !!body && typeof body.access_token === 'string' && body.access_token !== '' &&
    typeof body.refresh_token === 'string' && body.refresh_token !== '' && body.token_type === 'bearer' &&
    Number.isFinite(body.expires_in) && body.expires_in > 0 && body.expires_in <= ACCESS_SECONDS
}

export async function smoke(environment, { publicKey, password, fetchImpl = fetch, attempts = 3, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (!Object.hasOwn(PROJECTS, environment)) throw new Error('Choose --environment staging or production')
  if (!publicKey) throw new Error('SUPABASE_PUBLIC_KEY is required')
  if (typeof password !== 'string' || password === '') {
    throw new Error('The MEMBER_GATE_PASSWORD secret is missing: set the repository secret MEMBER_GATE_PASSWORD (the shared member password) ' +
      'and pass it to this step as env MEMBER_GATE_PASSWORD. The release smoke never skips the real sign-in.')
  }
  const base = `https://${PROJECTS[environment]}.supabase.co`
  const options = { attempts, wait }
  const signIn = value => call(fetchImpl, `${base}/functions/v1/member-session`, {
    method: 'POST',
    headers: { apikey: publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: value }),
  }, options)

  // 1. A wrong password is refused.
  const wrong = await signIn(`release-smoke-wrong-${randomUUID()}`)
  if (wrong.status !== 401) {
    throw new Error(`${environment} member-session answered ${wrong.label} to a wrong password; expected 401. ` +
      'The sign-in is broken (503 = missing hash secret, member identity or rate counter). Release stopped before the front end upload.')
  }

  // 2. The real password signs in.
  const right = await signIn(password)
  const accessToken = typeof right.body?.access_token === 'string' && right.body.access_token !== '' ? right.body.access_token : null
  let failure = null
  if (right.status !== 200) {
    failure = `${environment} member-session answered ${right.label} to the real password (MEMBER_GATE_PASSWORD); expected 200. ` +
      '401 = the secret and the deployed hash disagree; 429 = rate limited; 503 = misconfigured. Release stopped before the front end upload.'
  } else if (!isShortSession(right.body)) {
    failure = `${environment} member-session answered 200 to the real password but without a short (<= ${ACCESS_SECONDS} s) bearer session. Release stopped before the front end upload.`
  }

  // 3. Whatever happened above, a session that was handed out is signed out again.
  if (accessToken) {
    const out = await call(fetchImpl, `${base}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}` },
    }, options)
    if (out.status !== 204 && out.status !== 200) {
      failure ??= `${environment}: the smoke session could not be signed out (${out.label}); expected 204. ` +
        'It lives only in this runner\'s memory and its access token expires within 15 minutes; check Auth before releasing again.'
    }
  }
  if (failure) throw new Error(failure)
  return { ok: true, wrong: 401, right: 200, signedOut: true }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--environment')
  smoke(index >= 0 ? process.argv[index + 1] : undefined, {
    publicKey: process.env.SUPABASE_PUBLIC_KEY,
    password: process.env.MEMBER_GATE_PASSWORD,
  })
    .then(() => console.log('member-session refuses a wrong password (401), accepts the real one (200) and its smoke session was signed out'))
    .catch(error => { console.error(`::error::${error.message}`); process.exitCode = 1 })
}
