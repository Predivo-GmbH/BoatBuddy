import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { provisionMember, MEMBER_ID, MEMBER_EMAIL } from './provision-member.mjs'

const passwordHash = createHash('sha256').update('offline fixture').digest('hex')
function harness({ missing = false, userPatch = {}, secretDrift = false, status, invalidJson = false } = {}) {
  const calls = []
  const user = { id: MEMBER_ID, email: MEMBER_EMAIL, app_metadata: { boatbuddy_member: true }, ...userPatch }
  return { calls, args: {
    ref: 'offline-project', passwordHash,
    request: async (method, path, body) => {
      calls.push({ method, path, body })
      if (path.startsWith('/api-keys')) return [{ type: 'secret', api_key: 'offline-server-key' }]
      if (method === 'POST') return {}
      return secretDrift ? [] : [{ name: 'MEMBER_PASSWORD_HASH', value: createHash('sha256').update(passwordHash).digest('hex') }]
    },
    fetchImpl: async (url, options) => {
      assert.ok(url.startsWith('https://offline-project.supabase.co/auth/v1/admin/users'))
      assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal)
      assert.equal(options.headers.apikey, 'offline-server-key')
      calls.push({ method: options.method, path: new URL(url).pathname, body: options.body && JSON.parse(options.body) })
      if (status) return new Response('sensitive fixture detail', { status })
      if (invalidJson) return new Response('sensitive fixture detail')
      if (missing && options.method === 'GET') { missing = false; return new Response('{}', { status: 404 }) }
      return Response.json(user)
    },
  } }
}

test('provisions one confirmed member via Auth admin and never sends email', async () => {
  const { args, calls } = harness({ missing: true }); await provisionMember(args)
  const creation = calls.find(c => c.method === 'POST' && c.path.includes('/admin/users'))
  assert.equal(creation.body.id, MEMBER_ID); assert.equal(creation.body.email_confirm, true)
  assert.equal(creation.body.password.length, 64)
  assert.notEqual(creation.body.password, passwordHash)
  assert.deepEqual(creation.body.app_metadata, { boatbuddy_member: true })
  assert.ok(calls.every(c => !/recover|otp|invite/.test(c.path)))
})
test('repeat releases do not rotate an existing member identity or Auth password', async () => {
  const { args, calls } = harness(); await provisionMember(args)
  assert.ok(!calls.some(c => c.method !== 'GET' && c.path.includes('/admin/users')))
  const secrets = calls.find(c => c.method === 'POST' && c.path === '/secrets')
  assert.deepEqual(secrets.body, [{ name: 'MEMBER_PASSWORD_HASH', value: passwordHash }])
})
for (const patch of [{ id: 'wrong' }, { email: 'another@invalid.test' }, { app_metadata: {} },
  { banned_until: '2099-01-01T00:00:00Z' }, { deleted_at: '2026-01-01T00:00:00Z' }]) {
  test(`refuses identity drift/revocation: ${Object.keys(patch)[0]}`, async () => {
    const { args, calls } = harness({ userPatch: patch }); await assert.rejects(provisionMember(args), /identity not verified/)
    assert.ok(!calls.some(c => c.path === '/secrets'))
  })
}
test('refuses an unverified function secret', async () => {
  await assert.rejects(provisionMember(harness({ secretDrift: true }).args), /secret not verified/)
})
test('sanitizes Auth HTTP failures', async () => {
  await assert.rejects(provisionMember(harness({ status: 403 }).args), error => {
    assert.match(error.message, /HTTP 403/); assert.doesNotMatch(error.message, /sensitive/); return true
  })
})
test('sanitizes malformed Auth response bodies', async () => {
  await assert.rejects(provisionMember(harness({ invalidJson: true }).args), /invalid JSON/)
})
test('sanitizes Auth transport exceptions', async () => {
  const { args } = harness(); args.fetchImpl = async () => { throw new Error('sensitive fixture') }
  await assert.rejects(provisionMember(args), /transport failure/)
})
