import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { settingsPlan, applySettings, authToApply, GATED_AUTH, TARGETS } from './configure-auth.mjs'

function context(environment) {
  return {
    GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'Deploy', GITHUB_REPOSITORY: 'Predivo-GmbH/BoatBuddy',
    GITHUB_REF: 'refs/heads/main', GITHUB_JOB: TARGETS[environment].job,
    GITHUB_EVENT_NAME: TARGETS[environment].event, RELEASE_CONFIRM: 'deploy', SUPABASE_ACCESS_TOKEN: 'fixture-only',
  }
}

// Defaults match both BoatBuddy projects as read on 2026-11-04: free plan, no custom SMTP.
function harness(environment, { sslEnabled = false, fail, drift, malformed, tier = 'free', smtp = false, org = 'fixture-org' } = {}) {
  const calls = []
  const plan = settingsPlan(environment)
  return { calls, fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    assert.equal(options.headers.Authorization, 'Bearer fixture-only')
    const projectUrl = `https://api.supabase.com/v1/projects/${plan.ref}`
    let endpoint
    if (url === projectUrl) endpoint = '/project'
    else if (url === `https://api.supabase.com/v1/organizations/${org}`) endpoint = '/organization'
    else {
      assert.ok(url.startsWith(`${projectUrl}/`))
      endpoint = url.slice(projectUrl.length)
    }
    const key = `${options.method} ${endpoint}`
    calls.push({ key, body: options.body && JSON.parse(options.body) })
    if (key === fail) return new Response('DO NOT ECHO: fixture secret', { status: 403 })
    if (key === malformed) return new Response('DO NOT ECHO: fixture secret')
    let body = endpoint === '/config/auth' ? { ...plan.auth, smtp_host: smtp ? 'smtp.example.test' : '' } :
      endpoint === '/postgrest' ? { ...plan.postgrest } :
      endpoint === '/project' ? { organization_id: org } :
      endpoint === '/organization' ? (tier === undefined ? {} : { plan: tier }) :
      { currentConfig: { database: options.method === 'PUT' || sslEnabled }, appliedSuccessfully: true }
    if (key === drift) body = {}
    return Response.json(body)
  } }
}
const SEQUENCE = ['GET /ssl-enforcement', 'PUT /ssl-enforcement', 'GET /project', 'GET /organization', 'GET /config/auth',
  'PATCH /config/auth', 'GET /config/auth', 'PATCH /postgrest', 'GET /postgrest']
const quiet = () => {}

for (const environment of ['staging', 'production']) {
  test(`${environment}: exact isolated origin and defensive auth settings`, () => {
    const { auth, postgrest } = settingsPlan(environment)
    assert.equal(auth.site_url, TARGETS[environment].origin)
    assert.equal(auth.uri_allow_list, `${auth.site_url}/`)
    assert.doesNotMatch(auth.uri_allow_list, /\*|localhost/)
    assert.equal(auth.mailer_otp_exp, 600)
    assert.equal(auth.mailer_otp_length, 6)
    assert.match(auth.mailer_templates_magic_link_content, /{{ \.Token }}/)
    assert.doesNotMatch(auth.mailer_templates_magic_link_content, /ConfirmationURL|href=/)
    assert.equal(auth.external_email_enabled, false)
    assert.equal(auth.disable_signup, true)
    assert.equal(auth.sessions_timebox, 2592000)
    assert.equal(auth.sessions_inactivity_timeout, 604800)
    assert.equal(auth.security_refresh_token_reuse_interval, 10)
    assert.equal(auth.password_min_length, 15)
    assert.equal(auth.password_hibp_enabled, true)
    assert.equal(auth.password_required_characters, '')
    assert.deepEqual(postgrest, { db_schema: 'public', db_extra_search_path: 'public, extensions' })
  })
  test(`${environment}: applies and reads back only that project's settings`, async () => {
    const fake = harness(environment, { tier: 'pro', smtp: true })
    assert.deepEqual(await applySettings(environment, { env: context(environment), ...fake, log: quiet }), { environment, verified: true, notOffered: [] })
    assert.deepEqual(fake.calls.map(c => c.key), SEQUENCE)
    assert.deepEqual(fake.calls[1].body, { requestedConfig: { database: true } })
    assert.deepEqual(fake.calls[5].body, settingsPlan(environment).auth)
    assert.ok(fake.calls.every(c => !c.key.includes('network-restrictions')))
  })
  test(`${environment}: free plan without custom SMTP sends only what Supabase accepts, and says what it left out`, async () => {
    const fake = harness(environment)
    const lines = []
    const result = await applySettings(environment, { env: context(environment), ...fake, log: line => lines.push(line) })
    const gated = Object.keys(GATED_AUTH).sort()
    assert.deepEqual([...result.notOffered].sort(), gated)
    const sent = fake.calls[5].body
    for (const name of gated) assert.ok(!(name in sent), `${name} must not be sent`)
    const { auth } = settingsPlan(environment)
    for (const [name, value] of Object.entries(auth)) if (!gated.includes(name)) assert.equal(sent[name], value)
    assert.equal(lines.length, gated.length)
    for (const name of gated) assert.ok(lines.some(line => line.startsWith('::warning::') && line.includes(name)), `${name} is named`)
    assert.ok(lines.filter(line => line.includes('"free"')).length === 3)
  })
  test(`${environment}: already enforced SSL causes no restart`, async () => {
    const fake = harness(environment, { sslEnabled: true })
    await applySettings(environment, { env: context(environment), ...fake, log: quiet })
    assert.ok(!fake.calls.some(c => c.key === 'PUT /ssl-enforcement'))
  })
}

test('the Pro settings are sent on any tier that is not explicitly free, so Supabase decides', () => {
  const { auth } = settingsPlan('staging')
  for (const tier of ['pro', 'team', 'enterprise', undefined, 'unknown-new-tier']) {
    const { apply, notOffered } = authToApply(auth, { tier, customSmtp: true })
    assert.deepEqual(notOffered, [], `tier ${tier}`)
    assert.deepEqual(apply, auth)
  }
  assert.deepEqual(authToApply(auth, { tier: 'pro', customSmtp: false }).notOffered, ['rate_limit_email_sent'])
  assert.deepEqual(authToApply(auth, { tier: 'free', customSmtp: true }).notOffered.sort(),
    ['password_hibp_enabled', 'sessions_inactivity_timeout', 'sessions_timebox'])
})
test('only the four settings Supabase gates are ever left out', () => {
  assert.deepEqual(Object.keys(GATED_AUTH).sort(),
    ['password_hibp_enabled', 'rate_limit_email_sent', 'sessions_inactivity_timeout', 'sessions_timebox'])
  const { auth } = settingsPlan('production')
  const { apply } = authToApply(auth, { tier: 'free', customSmtp: false })
  assert.equal(Object.keys(apply).length, Object.keys(auth).length - 4)
})
test('an unreadable organization stops the release before any auth change', async () => {
  const fake = harness('staging', { drift: 'GET /project' })
  await assert.rejects(applySettings('staging', { env: context('staging'), ...fake, log: quiet }), /no organization/)
  assert.ok(!fake.calls.some(c => c.key === 'PATCH /config/auth'))
})

for (const patch of [
  { GITHUB_ACTIONS: '' }, { GITHUB_WORKFLOW: 'Critical Path Tests' }, { GITHUB_REPOSITORY: 'another/repo' },
  { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_JOB: 'deploy-staging' }, { GITHUB_EVENT_NAME: 'pull_request' },
  { GITHUB_EVENT_NAME: 'push' }, { RELEASE_CONFIRM: '' }, { SUPABASE_ACCESS_TOKEN: '' },
]) {
  test(`production refuses wrong release context: ${Object.keys(patch)[0]}=${Object.values(patch)[0]}`, async () => {
    let called = false
    await assert.rejects(applySettings('production', { env: { ...context('production'), ...patch }, fetchImpl: () => { called = true } }))
    assert.equal(called, false)
  })
}
test('staging refuses the production job', async () => {
  await assert.rejects(applySettings('staging', { env: context('production'), fetchImpl: () => assert.fail('no network') }))
})
for (const key of ['GET /ssl-enforcement', 'PUT /ssl-enforcement', 'GET /project', 'GET /organization', 'PATCH /config/auth', 'GET /config/auth', 'PATCH /postgrest', 'GET /postgrest']) {
  test(`fails closed without leaking response content: ${key}`, async () => {
    const fake = harness('staging', { fail: key })
    await assert.rejects(applySettings('staging', { env: context('staging'), ...fake, log: quiet }), error => {
      assert.match(error.message, /HTTP 403/)
      assert.doesNotMatch(error.message, /fixture|secret/)
      return true
    })
    assert.equal(fake.calls.at(-1).key, key)
  })
}
for (const key of ['PUT /ssl-enforcement', 'GET /config/auth', 'GET /postgrest']) {
  test(`unverified state stops release: ${key}`, async () => {
    const fake = harness('staging', { drift: key })
    await assert.rejects(applySettings('staging', { env: context('staging'), ...fake, log: quiet }))
    assert.equal(fake.calls.at(-1).key, key)
  })
}
test('transport exceptions are sanitized', async () => {
  await assert.rejects(applySettings('staging', { env: context('staging'), fetchImpl: () => { throw new Error('fixture secret') } }), /transport failure/)
})
test('invalid JSON is sanitized', async () => {
  await assert.rejects(applySettings('staging', { env: context('staging'), ...harness('staging', { malformed: 'GET /ssl-enforcement' }) }), /invalid JSON/)
})
test('CLI defaults to offline without a token', () => {
  const result = spawnSync(process.execPath, ['scripts/configure-auth.mjs', '--environment', 'production'], { encoding: 'utf8', env: {} })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /no requests made/)
})
test('unknown environments are rejected', () => {
  for (const name of ['prod', '__proto__', undefined]) assert.throws(() => settingsPlan(name))
})
