import { test } from 'node:test'
import assert from 'node:assert/strict'
import { smoke, PROJECTS } from './member-gate-smoke.mjs'

const noWait = async () => {}
const PASSWORD = 'offline-fixture-member-password'
const SESSION = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: 1, expires_in: 900, token_type: 'bearer' }

// A fake Supabase: member-session answers by password (wrong / real), logout by its own list.
function fake({ wrong = [401], right = [200], logout = [204], session = SESSION } = {}) {
  const calls = []
  const next = (list, n) => list[Math.min(n, list.length - 1)]
  let wrongN = 0, rightN = 0, logoutN = 0
  return { calls, fetchImpl: async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, options, body })
    let status, payload = {}
    if (url.endsWith('/auth/v1/logout?scope=local')) {
      status = next(logout, logoutN++)
    } else if (body?.password === PASSWORD) {
      status = next(right, rightN++)
      if (status === 200) payload = session
    } else {
      status = next(wrong, wrongN++)
    }
    if (status === 'throw') throw new Error('offline fixture')
    return new Response(status === 204 ? null : JSON.stringify(payload), { status })
  } }
}
const run = (environment, f, extra = {}) => smoke(environment, { publicKey: 'public-fixture', password: PASSWORD, fetchImpl: f.fetchImpl, wait: noWait, ...extra })

test('wrong password 401, real password 200 with a session, then that session is signed out: on the right project', async () => {
  for (const environment of ['staging', 'production']) {
    const f = fake()
    assert.deepEqual(await run(environment, f), { ok: true, wrong: 401, right: 200, signedOut: true })
    const base = `https://${PROJECTS[environment]}.supabase.co`
    assert.deepEqual(f.calls.map(c => c.url), [`${base}/functions/v1/member-session`, `${base}/functions/v1/member-session`, `${base}/auth/v1/logout?scope=local`])
    assert.match(f.calls[0].body.password, /^release-smoke-wrong-[0-9a-f-]{36}$/)
    assert.equal(f.calls[1].body.password, PASSWORD)
    for (const c of f.calls) { assert.equal(c.options.method, 'POST'); assert.equal(c.options.redirect, 'error') }
    // Only THIS session is signed out (scope=local), never every device of the shared member.
    assert.equal(f.calls[2].options.headers.Authorization, 'Bearer fixture-access')
    assert.equal(f.calls[2].options.headers.apikey, 'public-fixture')
  }
})
test('two runs never send the same wrong guess', async () => {
  const f = fake()
  await run('staging', f); await run('staging', f)
  assert.notEqual(f.calls[0].body.password, f.calls[3].body.password)
})
test('a missing MEMBER_GATE_PASSWORD fails with the secret named and sends nothing (never skips)', async () => {
  for (const password of [undefined, '']) {
    const f = fake()
    await assert.rejects(run('production', f, { password }), /MEMBER_GATE_PASSWORD secret is missing/)
    assert.equal(f.calls.length, 0)
  }
})
test('a persistent 503 to the wrong password stops the release before the real password is sent', async () => {
  const f = fake({ wrong: [503] })
  await assert.rejects(run('production', f), /HTTP 503.*expected 401/)
  assert.equal(f.calls.length, 3)
  assert.ok(f.calls.every(c => c.body.password !== PASSWORD))
})
test('one cold-start 5xx is retried', async () => {
  assert.equal((await run('production', fake({ wrong: [502, 401], right: [503, 200] }))).right, 200)
})
test('200, 429 and 404 to a wrong password fail at once (a wrong password must never sign in)', async () => {
  for (const status of [200, 429, 404]) {
    const f = fake({ wrong: [status] })
    await assert.rejects(run('staging', f), new RegExp(`HTTP ${status}.*wrong password`))
    assert.equal(f.calls.length, 1)
  }
})
test('the real password refused (401, 429, 503) stops the release', async () => {
  for (const status of [401, 429, 503]) {
    await assert.rejects(run('staging', fake({ right: [status] })), new RegExp(`HTTP ${status} to the real password.*expected 200`))
  }
})
test('a 200 without a short bearer session fails, and the session it did hand out is still signed out', async () => {
  for (const session of [{ ...SESSION, expires_in: 3600 }, { ...SESSION, refresh_token: '' }, { ...SESSION, token_type: 'other' }]) {
    const f = fake({ session })
    await assert.rejects(run('production', f), /without a short/)
    assert.ok(f.calls.at(-1).url.endsWith('/auth/v1/logout?scope=local'))
  }
})
test('a session that cannot be signed out fails the step', async () => {
  for (const logout of [[401], [500], ['throw']]) {
    await assert.rejects(run('production', fake({ logout })), /could not be signed out/)
  }
})
test('no error message ever contains the password or a token', async () => {
  const cases = [{ wrong: [503] }, { right: [401] }, { session: { ...SESSION, expires_in: 9999 } }, { logout: [500] }]
  for (const c of cases) {
    await assert.rejects(run('staging', fake(c)), error => {
      assert.doesNotMatch(error.message, /offline-fixture-member-password|fixture-access|fixture-refresh/)
      return true
    })
  }
})
test('unreachable and misconfigured calls fail closed', async () => {
  await assert.rejects(run('staging', fake({ wrong: ['throw'] })), /unreachable/)
  await assert.rejects(run('staging', fake(), { publicKey: '' }), /SUPABASE_PUBLIC_KEY/)
  await assert.rejects(run('elsewhere', fake()), /staging or production/)
})
