// @vitest-environment node
// Contract section 3 d + e (C:/Business/Audits/CONTRACT-customer-error-message-2026-11-08.md):
// the function removes an e-mail address from `message`, refuses an oversized body, rate-limits,
// and answers 200 only after the row exists (database failure -> 503).
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createReportHandler, scrubMessage, newReference, REFERENCE, CALLER_LIMIT, GLOBAL_LIMIT, BODY_LIMIT, type ReportRow, type ReportDependencies } from './handler.ts'

const MEMBER = '07a91df9-55d7-42b4-9944-82f5b88dcf7e'
const report = (over: Record<string, unknown> = {}) => ({
  area: 'other', screen: 'finanzen', action: 'createAusgabe', status: 500,
  message: 'insert failed', app_version: 'abc1234', ...over,
})
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://fixture.supabase.co/functions/v1/report-client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
function harness(over: Partial<ReportDependencies> = {}) {
  const rows: ReportRow[] = []
  const counts = new Map<string, number>()
  const lines: string[] = []
  const deps: ReportDependencies = {
    hmacKey: 'fixture key',
    now: () => 1_800_000_000_000,
    bump: vi.fn(async (key: string, window: string) => {
      const k = `${key}@${window}`; const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n
    }),
    userIdOf: vi.fn(async (bearer: string) => bearer === 'member-access-token' ? MEMBER : null),
    store: vi.fn(async (row: ReportRow) => { rows.push(row); return 'stored' as const }),
    log: (line: string) => { lines.push(line) },
    ...over,
  }
  return { deps, rows, counts, lines, handle: createReportHandler(deps) }
}

describe('report-client-error stores a report and answers with its reference', () => {
  it('answers 200 with an E-XXXXXX reference that is the one stored on the row', async () => {
    const h = harness()
    const res = await h.handle(request(report()))
    expect(res.status).toBe(200)
    const { reference } = await res.json()
    expect(reference).toMatch(REFERENCE)
    expect(h.rows).toHaveLength(1)
    expect(h.rows[0]).toMatchObject({ reference, area: 'other', screen: 'finanzen', action: 'createAusgabe', status: 500, app_version: 'abc1234', user_id: null })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('logs exactly one line, the one the 5-minute watcher counts, with no user, address or message', async () => {
    const h = harness()
    await h.handle(request(report({ message: 'secret detail someone@example.com' }), { authorization: 'Bearer member-access-token' }))
    expect(h.lines).toEqual(['client_error area=other screen=finanzen'])
  })

  it('stores the user id of a signed-in caller and works signed out', async () => {
    const h = harness()
    expect((await h.handle(request(report(), { authorization: 'Bearer member-access-token' }))).status).toBe(200)
    expect((await h.handle(request(report(), { authorization: 'Bearer public-anon-key' }))).status).toBe(200)
    expect((await h.handle(request(report()))).status).toBe(200)
    expect(h.rows.map(r => r.user_id)).toEqual([MEMBER, null, null])
    for (const row of h.rows) expect(JSON.stringify(row)).not.toMatch(/@/)
  })

  it('still stores the report when the user lookup fails', async () => {
    const h = harness({ userIdOf: vi.fn(async () => { throw new Error('auth down') }) })
    expect((await h.handle(request(report(), { authorization: 'Bearer member-access-token' }))).status).toBe(200)
    expect(h.rows[0].user_id).toBeNull()
  })

  it('accepts the three areas and refuses anything else', async () => {
    const h = harness()
    for (const area of ['money', 'signin', 'other']) expect((await h.handle(request(report({ area })))).status).toBe(200)
    for (const area of ['payment', '', null, 1]) expect((await h.handle(request(report({ area })))).status).toBe(400)
    expect(h.rows).toHaveLength(3)
  })

  it('refuses invalid fields instead of storing them', async () => {
    const h = harness()
    for (const bad of [
      { screen: '' }, { screen: 'a'.repeat(61) }, { screen: 'two words' }, { screen: 'x\nclient_error area=money' },
      { action: '' }, { action: 'a'.repeat(61) }, { status: 600 }, { status: -1 }, { status: 1.5 }, { status: '500' },
      { message: 42 }, { message: undefined },
    ]) {
      expect((await h.handle(request(report(bad)))).status, JSON.stringify(bad)).toBe(400)
    }
    for (const bad of ['not json', '[]', 'null']) expect((await h.handle(request(bad))).status).toBe(400)
    const wrongType = new Request('https://fixture.supabase.co/functions/v1/report-client-error', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(report()) })
    expect((await h.handle(wrongType)).status).toBe(400)
    expect(h.rows).toHaveLength(0)
  })

  it('keeps a status-less report and drops a malformed app version rather than the report', async () => {
    const h = harness()
    expect((await h.handle(request(report({ status: null, app_version: '<script>' })))).status).toBe(200)
    expect(h.rows[0]).toMatchObject({ status: null, app_version: null })
  })

  it('answers preflight and refuses other methods', async () => {
    const h = harness()
    expect((await h.handle(new Request('https://f/x', { method: 'OPTIONS' }))).status).toBe(204)
    expect((await h.handle(new Request('https://f/x', { method: 'GET' }))).status).toBe(405)
  })

  it('tries a new reference when the drawn one is already taken', async () => {
    const refs = ['E-AAAAAA', 'E-BBBBBB']
    let first = true
    const h = harness({
      newReference: () => refs.shift()!,
      store: vi.fn(async (row: ReportRow) => { if (first) { first = false; return 'duplicate' as const } h.rows.push(row); return 'stored' as const }),
    })
    const res = await h.handle(request(report()))
    expect(await res.json()).toEqual({ reference: 'E-BBBBBB' })
    expect(h.rows.map(r => r.reference)).toEqual(['E-BBBBBB'])
  })

  it('draws short random references from an unambiguous alphabet', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newReference()))
    for (const ref of seen) expect(ref).toMatch(/^E-[A-HJ-NP-Z2-9]{6}$/)
    expect(seen.size).toBeGreaterThan(190)
  })
})

describe('d. the function removes personal data from the message, refuses an oversized body, rate-limits', () => {
  it('removes an e-mail address from the message before it is stored', async () => {
    const h = harness()
    await h.handle(request(report({ message: 'duplicate key for member.name+boat@example.ch and %22a%40b.com%22' })))
    expect(h.rows[0].message).not.toMatch(/member\.name|example\.ch|a%40b/)
    expect(h.rows[0].message).toContain('[e-mail]')
    expect(h.rows[0].message).toContain('duplicate key for')
  })

  it('removes tokens and long random strings, keeps the readable error', () => {
    // Built at run time from harmless parts, so no secret-shaped literal sits in the repository
    // (gitleaks reads the source, not the test's values).
    const b64 = (s: string) => btoa(s).replace(/=+$/, '')
    const jwt = [b64('{"alg":"HS256"}'), b64('{"sub":"fixture-user"}'), b64('fixture signature')].join('.')
    const key = ['sb', 'publishable', 'fixture1234'].join('_')
    const hex = 'ab12'.repeat(8)
    const out = scrubMessage(`JWT ${jwt} Bearer abc.def apikey=${key} token: ${hex} ` +
      `row 07a91df9-55d7-42b4-9944-82f5b88dcf7e in create_nutzungslog_atomic: duplicate key value violates unique constraint`)
    for (const leaked of [jwt, 'abc.def', 'sb_publishable', hex, '07a91df9-55d7-42b4-9944-82f5b88dcf7e']) {
      expect(out).not.toContain(leaked)
    }
    expect(out).toContain('create_nutzungslog_atomic: duplicate key value violates unique constraint')
  })

  it('bounds the stored message to 500 characters and strips control characters', async () => {
    const h = harness()
    await h.handle(request(report({ message: `line one\nline two\u0000${'x '.repeat(400)}` })))
    expect(h.rows[0].message.length).toBeLessThanOrEqual(500)
    expect(h.rows[0].message).not.toMatch(/\p{Cc}/u)
    expect(h.rows[0].message.startsWith('line one line two')).toBe(true)
  })

  it('refuses an oversized body with 413 and stores nothing', async () => {
    const h = harness()
    const res = await h.handle(request(report({ message: 'x'.repeat(BODY_LIMIT) })))
    expect(res.status).toBe(413)
    expect(h.rows).toHaveLength(0)
    expect(h.deps.bump).not.toHaveBeenCalled()
  })

  it(`allows ${CALLER_LIMIT} reports an hour from one address, then answers 429`, async () => {
    const h = harness()
    for (let i = 0; i < CALLER_LIMIT; i++) expect((await h.handle(request(report()))).status).toBe(200)
    expect((await h.handle(request(report()))).status).toBe(429)
    expect(h.rows).toHaveLength(CALLER_LIMIT)
    // Another address is its own bucket.
    expect((await h.handle(request(report(), { 'cf-connecting-ip': '198.51.100.9' }))).status).toBe(200)
  })

  it('never keys or logs the raw address', async () => {
    const h = harness()
    await h.handle(request(report()))
    const keys = vi.mocked(h.deps.bump).mock.calls.map(([key]) => key)
    expect(keys.join(' ')).not.toContain('203.0.113.7')
    expect(h.lines.join(' ')).not.toContain('203.0.113.7')
  })

  it('without a trustworthy address, limits per user, and everyone signed out shares one bucket', async () => {
    const h = harness()
    const noIp = { 'cf-connecting-ip': '' }
    for (let i = 0; i < CALLER_LIMIT; i++) await h.handle(request(report(), noIp))
    expect((await h.handle(request(report(), noIp))).status).toBe(429)
    expect((await h.handle(request(report(), { ...noIp, authorization: 'Bearer member-access-token' }))).status).toBe(200)
  })

  it(`stops at ${GLOBAL_LIMIT} an hour for everyone together`, async () => {
    const h = harness({ bump: vi.fn(async (key: string) => key === 'client-error:all' ? GLOBAL_LIMIT + 1 : 1) })
    expect((await h.handle(request(report()))).status).toBe(429)
    expect(h.rows).toHaveLength(0)
  })
})

describe('e. 200 only after the row exists', () => {
  it('answers 503, without a reference, when the row cannot be stored', async () => {
    const h = harness({ store: vi.fn(async () => { throw new Error('database down') }) })
    const res = await h.handle(request(report()))
    expect(res.status).toBe(503)
    expect(await res.json()).not.toHaveProperty('reference')
    // The watcher still hears about it: the one line, marked as not stored.
    expect(h.lines).toEqual(['client_error area=other screen=finanzen stored=no'])
  })

  it('answers 503 when the rate counters (same database) are unavailable', async () => {
    const h = harness({ bump: vi.fn(async () => { throw new Error('database down') }) })
    const res = await h.handle(request(report()))
    expect(res.status).toBe(503)
    expect(h.deps.store).not.toHaveBeenCalled()
  })

  it('does not answer before the insert has finished', async () => {
    let finish!: () => void
    const h = harness({ store: vi.fn(() => new Promise<'stored'>(resolve => { finish = () => resolve('stored') })) })
    let answered = false
    const pending = h.handle(request(report())).then(res => { answered = true; return res })
    await vi.waitFor(() => expect(h.deps.store).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(answered).toBe(false)
    finish()
    expect((await pending).status).toBe(200)
  })

  it('the deployed store reads the row back before it says stored', () => {
    const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(index).toMatch(/\.from\('client_error_reports'\)\.insert\(row\)\.select\('reference'\)\.single\(\)/)
    expect(index).toMatch(/data\?\.reference !== row\.reference\) throw/)
  })
})
