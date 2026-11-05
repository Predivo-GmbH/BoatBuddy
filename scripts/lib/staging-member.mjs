// CI fixture authentication only. Native member tokens, NEVER a service key in
// a browser. Each browser context gets a refresh token no other open context holds.
//
// KEYS (2026-11-04, review of PR #38): only STAGING-scoped secrets reach test processes:
// BB_SVC_KEY (the staging service key) and the staging publishable key. The org-wide
// Management API token (SUPABASE_ACCESS_TOKEN) is deliberately NOT read here, so no
// workflow has a reason to hand it to npm test or Playwright.
import { createClient } from '@supabase/supabase-js'
import { MEMBER_ID, MEMBER_EMAIL } from './provision-member.mjs'

export const STAGING_REF = 'svpewgbwousyheohlrtt'
export const STAGING_API = `https://${STAGING_REF}.supabase.co`
let cached
export function stagingMemberSession(env = process.env, { fresh = false } = {}) {
  if (fresh) return issue(env)
  cached ??= issue(env)
  return cached
}

export function stagingKeys(env = process.env) {
  if (env.STAGING_SUPABASE_URL && env.STAGING_SUPABASE_URL !== STAGING_API) throw new Error('Tests require the BoatBuddy staging project')
  const serverKey = env.BB_SVC_KEY
  const publicKey = env.STAGING_SUPABASE_ANON_KEY || env.STAGING_ANON_KEY
  return { serverKey, publicKey }
}

const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

async function issue(env) {
  const { serverKey, publicKey } = stagingKeys(env)
  if (!serverKey || !publicKey) throw new Error('Staging member tests need BB_SVC_KEY and the staging publishable key (STAGING_SUPABASE_ANON_KEY)')
  const options = CLIENT_OPTIONS
  const admin = createClient(STAGING_API, serverKey, options)
  const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(MEMBER_ID)
  if (lookupError || existing.user?.email !== MEMBER_EMAIL || existing.user.app_metadata.boatbuddy_member !== true) {
    throw new Error('Staging member identity has not been provisioned by Deploy')
  }
  let reason = 'not attempted'
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: MEMBER_EMAIL })
    if (error || link.user.id !== MEMBER_ID) throw new Error(`Staging fixture session unavailable (${error?.code ?? 'link for another user'})`)
    const client = createClient(STAGING_API, publicKey, options)
    const { data, error: verification } = await client.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token })
    if (!verification && data.session?.user.app_metadata.boatbuddy_member === true) return { session: data.session, publicKey }
    reason = verification?.code ?? 'no member claim'
    if (verification?.code !== 'otp_expired') break
  }
  // The Auth error CODE only (e.g. over_request_rate_limit), never a token: run 41931476724
  // failed 11 tests with this message and nothing said why.
  throw new Error(`Staging fixture session unavailable (${reason})`)
}

/**
 * The NEXT session of a chain we already hold: one refresh-token exchange instead of a new
 * magic-link verification.
 *
 * WHY (2026-11-05, Critical Path Tests run 41931476724 on 6d869c0): Supabase Auth allows each IP
 * a burst of 30 token verifications, then one every ten seconds (360 an hour). The critical-path
 * suite opens about 70 browser contexts in six minutes. With one verification per context it ran
 * dry after about 60 sign-ins: every failure from test 60 on was "Staging fixture session
 * unavailable" after under a second, and the odd retry that came ten seconds later passed.
 *
 * A refresh still gives every browser context a refresh token no other context holds, which is what
 * fresh:true was for. The previous context is closed by then, so nothing replays a rotated token.
 * No service key is involved: the exchange uses the publishable key, as the browser would.
 */
export async function nextMemberSession(previous, env = process.env) {
  const { publicKey } = stagingKeys(env)
  if (!publicKey) throw new Error('The staging publishable key (STAGING_SUPABASE_ANON_KEY) is required')
  if (!previous?.refresh_token) throw new Error('No session to renew')
  const client = createClient(STAGING_API, publicKey, CLIENT_OPTIONS)
  const { data, error } = await client.auth.refreshSession({ refresh_token: previous.refresh_token })
  if (error || data.session?.user.app_metadata.boatbuddy_member !== true) {
    throw new Error(`Staging fixture session could not be renewed (${error?.code ?? 'no member claim'})`)
  }
  return data.session
}

// ONE verification per Playwright worker, then a renewal for every further browser context
// (see nextMemberSession for why). Tests in a worker run one after another and each closes its
// context, so handing the next context the next link of the chain never spends a token another
// open tab still holds. If the renewal is refused (the chain was revoked, or a tab rotated it),
// sign in afresh.
//
// A page that is signed in already keeps the session it got: e2e/member-session.ts writes it
// once per tab, so a second session would never be used. The Gate A crawl signs in once per
// ROUTE on ONE page; renewing the chain on each call would spend the token that page still
// holds, and the page's own refresh later would then be a reuse that revokes the session
// mid-crawl. So a page already signed in gets null: navigate, do not issue.
let latest
const signedIn = new WeakSet()
export async function memberSessionForPage(page, env = process.env) {
  if (signedIn.has(page)) return null
  let session
  if (latest) {
    try { session = await nextMemberSession(latest, env) } catch { latest = undefined }
  }
  session ??= (await issue(env)).session
  latest = session
  signedIn.add(page)
  return session
}

/**
 * The REAL member sign-in, exactly as the browser does it: POST the shared password to
 * the deployed member-session function. Returns only the status and the parsed body; the
 * password is never logged, echoed or put in an error message.
 */
export async function exchangeSharedPassword(password, env = process.env, fetchImpl = fetch) {
  const { publicKey } = stagingKeys(env)
  if (!publicKey) throw new Error('The staging publishable key (STAGING_SUPABASE_ANON_KEY) is required')
  if (typeof password !== 'string' || password === '') throw new Error('No password given')
  let response
  try {
    response = await fetchImpl(`${STAGING_API}/functions/v1/member-session`, {
      method: 'POST',
      headers: { apikey: publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new Error('member-session unreachable')
  }
  let body = null
  try { body = await response.json() } catch { /* status alone decides */ }
  return { status: response.status, body }
}
