// How the staging browser tests sign the shared member in, proven OFFLINE: the real supabase-js
// talks to a fake Auth server (globalThis.fetch), so no key, no network and no staging project.
//
// Why this exists (2026-11-05): Critical Path Tests run 41931476724 signed in once per test, ran
// through Supabase's token-verification allowance (a burst of 30 per IP, then one per ten seconds)
// after ~60 sign-ins, and failed 11 tests with "Staging fixture session unavailable" and no reason.
// All keys below are fake strings.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.BB_SVC_KEY = 'fake-server-key'
process.env.STAGING_SUPABASE_ANON_KEY = 'fake-public-key'
delete process.env.STAGING_SUPABASE_URL
const { MEMBER_ID, MEMBER_EMAIL } = await import('./provision-member.mjs')

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const user = { id: MEMBER_ID, aud: 'authenticated', email: MEMBER_EMAIL, app_metadata: { boatbuddy_member: true }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
let issued = 0
const calls = []
const mode = { verify: 'ok', refresh: 'ok' }
function session() {
  issued++
  const exp = Math.floor(Date.now() / 1000) + 900
  return { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: MEMBER_ID, exp })}.fake`, refresh_token: `r${issued}`, expires_in: 900, expires_at: exp, token_type: 'bearer', user }
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  const body = init.body ? JSON.parse(init.body) : null
  const path = url.pathname
  if (path.startsWith('/auth/v1/admin/users/')) return json(200, user)
  if (path === '/auth/v1/admin/generate_link') {
    return json(200, { ...user, action_link: 'fake', email_otp: 'fake', hashed_token: 'fake', redirect_to: 'fake', verification_type: 'magiclink' })
  }
  if (path === '/auth/v1/verify') {
    calls.push('verify')
    if (mode.verify === 'limited') return json(429, { code: 'over_request_rate_limit', error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' })
    return json(200, session())
  }
  if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    calls.push(`refresh:${body.refresh_token}`)
    if (mode.refresh === 'used') return json(400, { code: 'refresh_token_already_used', error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' })
    return json(200, session())
  }
  throw new Error(`offline test made an unexpected request: ${path}`)
}
const { memberSessionForPage, stagingMemberSession } = await import('./staging-member.mjs')
const page = () => ({})

test('one verification per worker, then one renewal per further browser context', async () => {
  const first = await memberSessionForPage(page())
  const second = await memberSessionForPage(page())
  const third = await memberSessionForPage(page())
  assert.deepEqual(calls, ['verify', 'refresh:r1', 'refresh:r2'])
  assert.deepEqual([first, second, third].map((s) => s.refresh_token), ['r1', 'r2', 'r3'], 'every context holds a token no other context holds')
})

test('a page that is signed in already gets nothing new (the Gate A crawl signs in once per route on one page)', async () => {
  calls.length = 0
  const crawl = page()
  assert.equal((await memberSessionForPage(crawl)).refresh_token, 'r4')
  assert.equal(await memberSessionForPage(crawl), null)
  assert.equal(await memberSessionForPage(crawl), null)
  assert.deepEqual(calls, ['refresh:r3'], 'no verification and no renewal that would spend the token the page still holds')
})

test('a refused renewal signs in afresh instead of failing the test', async () => {
  calls.length = 0
  mode.refresh = 'used'
  try {
    assert.equal((await memberSessionForPage(page())).refresh_token, 'r5')
    assert.deepEqual(calls, ['refresh:r4', 'verify'])
  } finally { mode.refresh = 'ok' }
})

test('a failed sign-in names the Auth error code, never a token', async () => {
  mode.verify = 'limited'
  try {
    await assert.rejects(stagingMemberSession(process.env, { fresh: true }), { message: 'Staging fixture session unavailable (over_request_rate_limit)' })
  } finally { mode.verify = 'ok' }
})
