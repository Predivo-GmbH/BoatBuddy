// CI fixture authentication only. Native member tokens, NEVER a service key in
// a browser. Each browser context gets its own rotating refresh-token chain.
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
async function issue(env) {
  if (env.STAGING_SUPABASE_URL && env.STAGING_SUPABASE_URL !== STAGING_API) throw new Error('Tests require the BoatBuddy staging project')
  let serverKey = env.BB_SVC_KEY
  let publicKey = env.STAGING_SUPABASE_ANON_KEY || env.STAGING_ANON_KEY
  const management = env.SUPABASE_ACCESS_TOKEN || env.BB_MGMT_TOKEN
  if ((!serverKey || !publicKey) && management) {
    let res
    try {
      res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/api-keys?reveal=true`, {
        headers: { Authorization: `Bearer ${management}` }, redirect: 'error', signal: AbortSignal.timeout(30_000),
      })
    } catch { throw new Error('Staging fixture keys unavailable') }
    if (!res.ok) { await res.body?.cancel(); throw new Error('Staging fixture keys unavailable') }
    const keys = await res.json()
    serverKey ??= keys.find(k => k.type === 'secret')?.api_key ?? keys.find(k => k.name === 'service_role')?.api_key
    publicKey ||= keys.find(k => k.type === 'publishable')?.api_key ?? keys.find(k => k.name === 'anon')?.api_key
  }
  if (!serverKey || !publicKey) throw new Error('Staging member tests need existing staging API keys or SUPABASE_ACCESS_TOKEN')
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
