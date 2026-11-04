import { test } from 'node:test'
import assert from 'node:assert/strict'
import { smoke, PROJECTS } from './member-gate-smoke.mjs'

const noWait = async () => {}
function fake(statuses) {
  const calls = []
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) })
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)]
    if (status === 'throw') throw new Error('offline fixture')
    return new Response('{}', { status })
  } }
}

test('a 401 to a random wrong password passes, on the right project, without the real password', async () => {
  for (const environment of ['staging', 'production']) {
    const f = fake([401])
    assert.deepEqual(await smoke(environment, { publicKey: 'public-fixture', fetchImpl: f.fetchImpl, wait: noWait }), { ok: true, status: 401 })
    assert.equal(f.calls[0].url, `https://${PROJECTS[environment]}.supabase.co/functions/v1/member-session`)
    assert.equal(f.calls[0].options.method, 'POST')
    assert.equal(f.calls[0].options.redirect, 'error')
    assert.match(f.calls[0].body.password, /^release-smoke-wrong-[0-9a-f-]{36}$/)
  }
})
test('two runs never send the same guess', async () => {
  const f = fake([401])
  await smoke('staging', { publicKey: 'k', fetchImpl: f.fetchImpl, wait: noWait })
  await smoke('staging', { publicKey: 'k', fetchImpl: f.fetchImpl, wait: noWait })
  assert.notEqual(f.calls[0].body.password, f.calls[1].body.password)
})
test('a persistent 503 stops the release', async () => {
  const f = fake([503])
  await assert.rejects(smoke('production', { publicKey: 'k', fetchImpl: f.fetchImpl, wait: noWait }), /HTTP 503.*expected 401/)
  assert.equal(f.calls.length, 3)
})
test('one cold-start 5xx is retried', async () => {
  const f = fake([502, 401])
  assert.equal((await smoke('production', { publicKey: 'k', fetchImpl: f.fetchImpl, wait: noWait })).status, 401)
})
test('200, 429 and 404 fail at once (a wrong password must never sign in)', async () => {
  for (const status of [200, 429, 404]) {
    const f = fake([status])
    await assert.rejects(smoke('staging', { publicKey: 'k', fetchImpl: f.fetchImpl, wait: noWait }), new RegExp(`HTTP ${status}`))
    assert.equal(f.calls.length, 1)
  }
})
test('unreachable and misconfigured calls fail closed', async () => {
  await assert.rejects(smoke('staging', { publicKey: 'k', fetchImpl: fake(['throw']).fetchImpl, wait: noWait }), /unreachable/)
  await assert.rejects(smoke('staging', { publicKey: '', fetchImpl: fake([401]).fetchImpl }), /SUPABASE_PUBLIC_KEY/)
  await assert.rejects(smoke('elsewhere', { publicKey: 'k', fetchImpl: fake([401]).fetchImpl }), /staging or production/)
})
