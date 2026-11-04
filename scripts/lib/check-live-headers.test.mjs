import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { checkOnce, firstAssets, requiredHeaders, visitorUrl } from '../check-live-headers.mjs'

const base = 'https://example.invalid'
const html = '<script src="https://cdn.example.invalid/third-party.js"></script><script src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">'
const healthy = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), payment=(), geolocation=(), usb=()',
  'content-security-policy': "default-src 'none'; script-src 'self'",
}

function transport(overrides = {}) {
  let time = 0
  const events = []
  return {
    events,
    waitImpl: async ms => { assert.ok(ms >= 1000); time += ms; events.push({ event: 'wait', time }) },
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'GET')
      assert.equal(options.redirect, 'manual')
      assert.equal(events.at(-1).event, 'wait')
      assert.ok(events.length === 1 || events.at(-2).event === 'body', 'finish the previous body before the next request')
      const previous = events.findLast(e => e.event === 'request')
      if (previous) assert.ok(time - previous.time >= 1000)
      events.push({ event: 'request', time, url, options })
      const headers = new Headers(healthy)
      if (overrides.missing && (!overrides.onlyAsset || url.endsWith('.css'))) headers.delete(overrides.missing)
      if (overrides.hsts !== undefined) headers.set('strict-transport-security', overrides.hsts)
      return {
        status: overrides.status ?? 200, headers,
        text: async () => { events.push({ event: 'body', time }); return overrides.html ?? html },
        arrayBuffer: async () => { events.push({ event: 'body', time }); return new ArrayBuffer(0) },
      }
    },
  }
}

test('GETs only, at least one second apart, finish each body; home and first same-origin JS/CSS', async () => {
  const offline = transport()
  assert.deepEqual(await checkOnce({ base, pages: ['/', '/pricing'], ...offline }), [])
  assert.deepEqual(offline.events.filter(e => e.event === 'request').map(e => e.url),
    [`${base}/`, `${base}/pricing`, `${base}/assets/app.js`, `${base}/assets/app.css`])
  assert.deepEqual(offline.events.map(e => e.event), Array.from({ length: 4 }, () => ['wait', 'request', 'body']).flat())
})

for (const header of requiredHeaders) {
  test(`missing header fails, including on an asset: ${header}`, async () => {
    for (const onlyAsset of [false, true]) {
      const problems = await checkOnce({ base, ...transport({ missing: header, onlyAsset }) })
      assert.ok(problems.some(p => p.includes(`missing ${header}`)))
    }
  })
}

test('HSTS below one year or malformed fails; the one-year boundary passes', async () => {
  for (const hsts of ['max-age=31535999', 'max-age=0', 'includeSubDomains', 'max-age=31536000garbage']) {
    assert.ok((await checkOnce({ base, ...transport({ hsts }) })).some(p => p.includes('HSTS max-age')))
  }
  assert.deepEqual(await checkOnce({ base, ...transport({ hsts: 'max-age=31536000; includeSubDomains' }) }), [])
})

test('HTTP errors/redirects and missing home-page assets fail', async () => {
  assert.ok((await checkOnce({ base, ...transport({ status: 301 }) })).some(p => p.includes('HTTP 301')))
  assert.ok((await checkOnce({ base, ...transport({ html: '<title>Missing links</title>' }) })).some(p => p.includes('no same-origin')))
})

test('unsafe paths are refused BEFORE any transport call (offline strings, never requests)', async () => {
  const forbidden = ['/.env', '/.git/config', '/wp-login.php', '/assets/app.js.map', '/dump.sql', '/docs/',
    '/../private', '/%252e%252e%252fprivate', '/.htaccess', '/file.bak', '/Credentials', '/phpmyadmin/', '/xmlrpc.php']
  for (const value of forbidden) {
    assert.throws(() => visitorUrl(value, base), /Refuse/)
    let calls = 0
    await assert.rejects(checkOnce({ base, pages: ['/', value], fetchImpl: async () => { calls++; throw new Error('transport must not be called') } }), /Refuse/)
    assert.equal(calls, 0)
    assert.throws(() => firstAssets(`<script src="${value}"></script>`, base), /Refuse/)
  }
  assert.throws(() => firstAssets('<script src="/&#46;env"></script>', base), /Refuse/)
})

test('credentials stay on the configured HTTPS origin; cross-origin targets fail before transport', async () => {
  for (const target of ['https://elsewhere.invalid/', 'https://user:password@example.invalid/']) {
    assert.throws(() => visitorUrl(target, base), /Refuse/)
  }
  await assert.rejects(checkOnce({ base: 'http://example.invalid', ...transport() }), /HTTPS/)
  const offline = transport()
  assert.deepEqual(await checkOnce({ base, headers: { authorization: 'Basic public-fixture' }, ...offline }), [])
  assert.ok(offline.events.filter(e => e.event === 'request').every(e => e.options.headers.authorization === 'Basic public-fixture'))
})

test('asset discovery handles attribute order, quotes, entities and skips comments/third parties', () => {
  assert.deepEqual(firstAssets(`<!-- <script src='/comment.js'></script> -->
    <script src='https://cdn.example.invalid/remote.js'></script>
    <script src='/app.js?a=1&amp;b=2'></script><script src='/second.js'></script>
    <link href=/app.css rel=stylesheet><link rel='stylesheet' href='/second.css'>`, base), {
    script: `${base}/app.js?a=1&b=2`, stylesheet: `${base}/app.css`,
  })
})

test('BoatBuddy runs the GET-only helper on staging with basic auth and on production after asset checks', () => {
  // BoatBuddy has no starter security-headers E2E spec. Exercise its actual release wiring.
  const workflow = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  const staging = workflow.split('  deploy-staging:')[1].split('  gate-integration:')[0]
  const production = workflow.split('\n  deploy:')[1]
  for (const job of [staging, production]) {
    assert.ok(job.indexOf('run: node scripts/check-live-headers.mjs') > job.indexOf('run: node scripts/verify-live-assets.mjs'))
    assert.match(job, /check-live-headers\.mjs --base https:\/\/(?:staging\.)?boatbuddy\.predivo\.ch --pages \/\s/)
  }
  assert.match(staging, /Verify staging GET security headers\s+env:\s+VERIFY_BASIC_AUTH: \$\{\{ secrets\.STAGING_HTPASSWD_USER \}\}:\$\{\{ secrets\.STAGING_HTPASSWD_PASS \}\}/)
  const helper = fs.readFileSync(new URL('../check-live-headers.mjs', import.meta.url), 'utf8')
  assert.match(helper, /method: 'GET', redirect: 'manual'/)
  assert.doesNotMatch(helper, /method: 'HEAD'|redirect: 'follow'/)
})
