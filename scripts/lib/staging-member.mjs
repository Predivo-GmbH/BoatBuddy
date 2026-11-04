// CI fixture authentication only. Native member tokens, NEVER a service key in
// a browser. Each browser context gets its own rotating refresh-token chain.
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

async function issue(env) {
  const { serverKey, publicKey } = stagingKeys(env)
  if (!serverKey || !publicKey) throw new Error('Staging member tests need BB_SVC_KEY and the staging publishable key (STAGING_SUPABASE_ANON_KEY)')
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const admin = createClient(STAGING_API, serverKey, options)
  const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(MEMBER_ID)
  if (lookupError || existing.user?.email !== MEMBER_EMAIL || existing.user.app_metadata.boatbuddy_member !== true) {
    throw new Error('Staging member identity has not been provisioned by Deploy')
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: MEMBER_EMAIL })
    if (error || link.user.id !== MEMBER_ID) throw new Error('Staging fixture session unavailable')
    const client = createClient(STAGING_API, publicKey, options)
    const { data, error: verification } = await client.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token })
    if (!verification && data.session?.user.app_metadata.boatbuddy_member === true) return { session: data.session, publicKey }
    if (verification?.code !== 'otp_expired') break
  }
  throw new Error('Staging fixture session unavailable')
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
