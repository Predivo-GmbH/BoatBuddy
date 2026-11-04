import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { gateOf, gateOpen, liveSiteReady, loadGates, planPending } from './release-gate.mjs'

const site = 'https://staging.boatbuddy.predivo.ch'
function liveSite(answer) {
  const calls = []
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options })
    if (answer === 'throw') throw new Error('offline fixture')
    return typeof answer === 'number' ? new Response('', { status: answer }) : new Response(answer, { status: 200 })
  } }
}
const MEMBER_BUILD = readFileSync('public/release.json', 'utf8')
const OLD_FRONT_END = '<!doctype html><html><body><div id="root"></div></body></html>' // SPA fallback

test('only a first-line marker gates a migration', () => {
  assert.equal(gateOf('-- release-gate: member-frontend-live\nbegin;'), 'member-frontend-live')
  assert.equal(gateOf('﻿-- release-gate: member-frontend-live\r\nbegin;'), 'member-frontend-live')
  assert.equal(gateOf('begin;\n-- release-gate: member-frontend-live'), null)
  assert.equal(gateOf('-- SR-SB-02/03 release 1'), null)
})

test('the repository ships release 1 only: 035 is gated, the flag is off, 034 is not gated', () => {
  const read = file => readFileSync(`supabase/migrations/${file}`, 'utf8')
  const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
  assert.deepEqual(files.filter(f => gateOf(read(f))), ['035_revoke_anonymous_access.sql'])
  assert.equal(gateOf(read('034_member_access_alongside_anon.sql')), null)
  assert.equal(loadGates()['member-frontend-live'], false)
  assert.deepEqual(JSON.parse(MEMBER_BUILD), { memberSession: true })
})

test('the live check passes only for the member build, fails closed otherwise', async () => {
  const ok = liveSite(MEMBER_BUILD)
  assert.equal((await liveSiteReady('member-frontend-live', { siteUrl: site, fetchImpl: ok.fetchImpl, basicAuth: { user: 'u', pass: 'p' } })).ready, true)
  assert.match(ok.calls[0].url, /^https:\/\/staging\.boatbuddy\.predivo\.ch\/release\.json\?t=\d+$/)
  assert.equal(ok.calls[0].options.redirect, 'error')
  assert.equal(ok.calls[0].options.headers.Authorization, `Basic ${Buffer.from('u:p').toString('base64')}`)
  for (const answer of [OLD_FRONT_END, '{"memberSession":false}', '{}', 'null', 404, 401, 500, 'throw']) {
    const result = await liveSiteReady('member-frontend-live', { siteUrl: site, fetchImpl: liveSite(answer).fetchImpl })
    assert.equal(result.ready, false, `answer ${answer} must not count as live`)
  }
  for (const siteUrl of [undefined, '', 'http://boatbuddy.predivo.ch', 'https://x/../y']) {
    assert.equal((await liveSiteReady('member-frontend-live', { siteUrl, fetchImpl: ok.fetchImpl })).ready, false)
  }
  assert.equal((await liveSiteReady('unknown-gate', { siteUrl: site, fetchImpl: ok.fetchImpl })).ready, false)
})

test('the gate opens only with the repository flag on AND the member build live', async () => {
  const live = liveSite(MEMBER_BUILD)
  assert.equal((await gateOpen('member-frontend-live', { gates: { 'member-frontend-live': false }, siteUrl: site, fetchImpl: live.fetchImpl })).open, false)
  assert.equal(live.calls.length, 0, 'a closed flag does not even ask the site')
  assert.equal((await gateOpen('member-frontend-live', { gates: { 'member-frontend-live': 'true' }, siteUrl: site, fetchImpl: live.fetchImpl })).open, false)
  assert.equal((await gateOpen('member-frontend-live', { gates: { 'member-frontend-live': true }, siteUrl: site, fetchImpl: liveSite(OLD_FRONT_END).fetchImpl })).open, false)
  assert.equal((await gateOpen('member-frontend-live', { gates: { 'member-frontend-live': true }, siteUrl: site, fetchImpl: live.fetchImpl })).open, true)
})

test('a closed gate defers its migration and every later one; ungated ones before it apply', async () => {
  const sql = { '033_a.sql': 'begin;', '034_b.sql': '-- additive', '035_c.sql': '-- release-gate: member-frontend-live\n', '036_d.sql': 'begin;' }
  const pending = Object.keys(sql).map(file => ({ file }))
  const readSql = m => sql[m.file]
  const closed = await planPending(pending, { readSql, gates: { 'member-frontend-live': true }, siteUrl: site, fetchImpl: liveSite(OLD_FRONT_END).fetchImpl })
  assert.deepEqual(closed.apply.map(m => m.file), ['033_a.sql', '034_b.sql'])
  assert.deepEqual(closed.deferred.map(m => m.file), ['035_c.sql', '036_d.sql'])
  assert.equal(closed.gate, 'member-frontend-live')
  assert.equal(closed.enabled, true)
  const off = await planPending(pending, { readSql, gates: {}, siteUrl: site, fetchImpl: liveSite(MEMBER_BUILD).fetchImpl })
  assert.equal(off.enabled, false)
  assert.equal(off.deferred.length, 2)
  const open = await planPending(pending, { readSql, gates: { 'member-frontend-live': true }, siteUrl: site, fetchImpl: liveSite(MEMBER_BUILD).fetchImpl })
  assert.deepEqual(open.apply.map(m => m.file), Object.keys(sql))
  assert.deepEqual(open.deferred, [])
})
