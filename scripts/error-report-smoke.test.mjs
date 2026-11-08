// The release smoke for report-client-error passes only when the function answered 200 with a
// reference AND that reference is a stored row; it never prints a key (contract 2026-11-08, 3e).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runSmoke } from './error-report-smoke.mjs'

const PUBLIC = 'fixture-public-key'
const TOKEN = 'fixture-management-token'
function api({ answer = { status: 200, body: { reference: 'E-SMOKE2' } }, rows = [{ n: 1 }], dbStatus = 200 } = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (url.includes('/functions/v1/report-client-error')) return new Response(JSON.stringify(answer.body), { status: answer.status })
    return new Response(JSON.stringify(rows), { status: dbStatus })
  }
  return { calls, fetchImpl }
}
const run = (fetchImpl, over = {}) => runSmoke({ environment: 'production', publicKey: PUBLIC, accessToken: TOKEN, fetchImpl, ...over })

test('passes with the reference when the row exists', async () => {
  const { calls, fetchImpl } = api()
  assert.equal(await run(fetchImpl), 'E-SMOKE2')
  assert.match(calls[0].url, /^https:\/\/xzythvxmuxmczuiophwp\.supabase\.co\/functions\/v1\/report-client-error$/)
  const report = JSON.parse(calls[0].init.body)
  assert.deepEqual([report.area, report.screen], ['other', 'release-smoke'])
  assert.equal(calls[0].init.headers['User-Agent'], 'boatbuddy-release-smoke')
  assert.match(JSON.parse(calls[1].init.body).query, /where reference = 'E-SMOKE2' and screen = 'release-smoke'/)
})

test('fails when the answer has no reference, or is not 200', async () => {
  for (const answer of [{ status: 503, body: { error: 'Report not stored' } }, { status: 200, body: {} }, { status: 200, body: { reference: "x' or 1=1 --" } }]) {
    const { fetchImpl } = api({ answer })
    await assert.rejects(run(fetchImpl), /did not answer 200 with a reference/)
  }
})

test('fails when the reference is not a stored row', async () => {
  for (const options of [{ rows: [{ n: 0 }] }, { rows: [] }, { dbStatus: 500 }]) {
    const { fetchImpl } = api(options)
    await assert.rejects(run(fetchImpl), /that row was not found/)
  }
})

test('fails, never skips, without its keys or a known environment', async () => {
  const { fetchImpl } = api()
  await assert.rejects(run(fetchImpl, { publicKey: '' }), /SUPABASE_PUBLIC_KEY/)
  await assert.rejects(run(fetchImpl, { accessToken: '' }), /SUPABASE_ACCESS_TOKEN/)
  await assert.rejects(run(fetchImpl, { environment: 'dev' }), /staging or production/)
})

test('prints only the reference line and the error, never a key', () => {
  const source = readFileSync(new URL('./error-report-smoke.mjs', import.meta.url), 'utf8')
  assert.deepEqual(source.match(/console\.\w+\(/g), ['console.log(', 'console.error('])
  assert.match(source, /console\.log\(`error report \(\$\{environment\}\): stored and answered with reference \$\{reference\}`\)/)
})

test('both deploy jobs run it after the edge functions and before the front end upload', () => {
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  for (const [job, env] of [['  deploy-staging:', 'staging'], ['\n  deploy:', 'production']]) {
    const body = deploy.split(job)[1]
    const fns = body.indexOf(`Deploy edge functions to ${env}`)
    const smoke = body.indexOf(`node scripts/error-report-smoke.mjs --environment ${env}`)
    const upload = body.search(/- name: Deploy (?:staging )?via FTP/)
    assert.ok(fns > 0 && smoke > fns && smoke < upload, `${env}: functions ${fns}, smoke ${smoke}, upload ${upload}`)
  }
})
