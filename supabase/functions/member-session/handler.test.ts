// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMemberHandler, passwordMatches, clientIp, SHARED_MEMBER_ID, WRONG_GLOBAL_KEY, type MemberSession } from './handler.ts'
import { clientIp as sharedClientIp } from '../_shared/client-ip.ts'
import { requireMember } from '../_shared/require-member.ts'
import { requireService } from '../_shared/require-service.ts'

const password = 'offline-only fixture password'
const hash = createHash('sha256').update(password).digest('hex')
const now = 1_800_000_000_000
const session: MemberSession = {
  access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: now / 1000 + 900,
  expires_in: 900, token_type: 'bearer', user: { id: SHARED_MEMBER_ID, app_metadata: { boatbuddy_member: true } },
}
function harness() {
  const counts = new Map<string, number>()
  const deps = {
    passwordHash: hash, now: () => now,
    bump: vi.fn(async (key: string, window: string) => {
      const k = key + window; const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n
    }),
    peek: vi.fn(async (key: string, window: string) => counts.get(key + window) ?? 0),
    issueSession: vi.fn(async () => structuredClone(session)),
  }
  const wrongCount = () => [...counts].filter(([k]) => k.startsWith(WRONG_GLOBAL_KEY)).reduce((n, [, v]) => n + v, 0)
  return { deps, counts, wrongCount, handle: createMemberHandler(deps) }
}
const request = (value: unknown = password, ip = '192.0.2.1') => new Request('http://offline/member-session', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ password: value }),
})

describe('server member exchange (offline)', () => {
  it('accepts the unchanged password and returns only a native short session', async () => {
    const { handle, deps } = harness(); const res = await handle(request())
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ access_token: session.access_token, refresh_token: session.refresh_token,
      expires_at: session.expires_at, expires_in: 900, token_type: 'bearer' })
    expect(deps.issueSession).toHaveBeenCalledOnce()
  })
  it.each(['wrong', '', hash, password + ' '])('rejects an incorrect password without issuing a session (%#)', async value => {
    const { handle, deps } = harness(); const res = await handle(request(value))
    expect(res.status).toBe(401); expect(await res.json()).toEqual({ error: 'Falsches Passwort' })
    expect(deps.issueSession).not.toHaveBeenCalled()
  })
  it('compares full SHA-256 digests including leading-zero bytes', () => {
    expect(passwordMatches(password, hash.toUpperCase())).toBe(true)
    expect(passwordMatches(password, '0'.repeat(64))).toBe(false)
  })
  it('fails closed if the server secret is missing', async () => {
    const { deps } = harness(); deps.passwordHash = ''
    expect((await createMemberHandler(deps)(request())).status).toBe(503)
    expect(deps.issueSession).not.toHaveBeenCalled()
  })
  it.each([null, 1, {}, 'x'.repeat(513)])('rejects invalid password input (%#)', async value => {
    const { handle, deps } = harness()
    expect((await handle(request(value))).status).toBe(400); expect(deps.issueSession).not.toHaveBeenCalled()
  })
  it('bounds actual bytes even with a forged Content-Length', async () => {
    const { handle } = harness()
    const req = request('x'.repeat(4096)); req.headers.set('content-length', '1')
    expect((await handle(req)).status).toBe(400)
  })
  it('refuses malformed JSON without echoing it', async () => {
    const { handle } = harness(); const res = await handle(new Request('http://offline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'sensitive body',
    }))
    expect(res.status).toBe(400); expect(await res.text()).not.toContain('sensitive')
  })
  it('shares the ten-attempt limit across isolates and simultaneous requests', async () => {
    const { deps } = harness()
    const responses = await Promise.all(Array.from({ length: 15 }, () => createMemberHandler(deps)(request())))
    expect(responses.filter(r => r.status === 200)).toHaveLength(10)
    expect(responses.filter(r => r.status === 429)).toHaveLength(5)
    expect(responses.find(r => r.status === 429)?.headers.get('retry-after')).toBeTruthy()
  })
  it('opens a new IP window when the previous window expires', async () => {
    const { deps, handle } = harness()
    for (let i = 0; i < 10; i++) await handle(request('wrong'))
    expect((await handle(request())).status).toBe(429)
    deps.now = () => now + 901_000
    deps.issueSession.mockResolvedValue({ ...session, expires_at: (now + 901_000) / 1000 + 900 })
    expect((await handle(request())).status).toBe(200)
  })
  it('caps distributed guesses globally, regardless of forwarded IP, without comparing the 61st', async () => {
    const { handle, deps } = harness()
    for (let i = 0; i < 60; i++) expect((await handle(request('wrong', `192.0.2.${i + 1}`))).status).toBe(401)
    const blocked = await handle(request(password, '198.51.100.2'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBeTruthy()
    expect(deps.issueSession).not.toHaveBeenCalled()
  })
  it('counts only WRONG passwords toward the shared budget: ordinary traffic never locks the boat out', async () => {
    const { handle, wrongCount } = harness()
    // 120 anonymous requests from 120 addresses that are not wrong passwords: right
    // passwords, malformed bodies, preflights. Before the fix the 61st locked everyone out.
    for (let i = 0; i < 40; i++) expect((await handle(request(password, `198.51.100.${i + 1}`))).status).toBe(200)
    for (let i = 0; i < 40; i++) expect((await handle(request(null, `203.0.113.${i + 1}`))).status).toBe(400)
    for (let i = 0; i < 40; i++) expect((await handle(new Request('http://offline', { method: 'OPTIONS' }))).status).toBe(204)
    expect(wrongCount()).toBe(0)
    expect((await handle(request(password, '192.0.2.200'))).status).toBe(200)
  })
  it('checks the caller address first: one address cannot spend the shared budget', async () => {
    const { handle, deps, wrongCount } = harness()
    // One attacker address hammering for a full hour, one request a second.
    for (let second = 0; second < 3600; second += 1) {
      deps.now = () => now + second * 1000
      await handle(request('wrong', '192.0.2.66'))
    }
    expect(wrongCount()).toBe(40) // 10 per quarter hour, 4 quarters
    deps.now = () => now + 3599_000
    deps.issueSession.mockResolvedValue({ ...session, expires_at: (now + 3599_000) / 1000 + 900 })
    expect((await handle(request(password, '198.51.100.7'))).status).toBe(200)
  })
  it('a member who typed the password right does not use up the shared budget', async () => {
    const { handle, wrongCount } = harness()
    await handle(request()); await handle(request('wrong')); await handle(request())
    expect(wrongCount()).toBe(1)
  })
  it.each([NaN, -1, undefined])('fails closed when the shared budget cannot be read (%#)', async count => {
    const { deps } = harness(); deps.peek.mockResolvedValue(count as number)
    expect((await createMemberHandler(deps)(request())).status).toBe(503)
    expect(deps.issueSession).not.toHaveBeenCalled()
  })
  it('ignores a caller-prepended IP and groups absent/malformed IPs', () => {
    expect(clientIp(request(password, 'attacker, 192.0.2.1'))).toBe('192.0.2.1')
    expect(clientIp(request(password, '198.51.100.9, 192.0.2.1'))).toBe('192.0.2.1')
    expect(clientIp(request(password, '2001:db8::1'))).toBe('2001:db8::1')
    expect(clientIp(request(password, 'attacker'))).toBe('unknown')
    expect(clientIp(new Request('http://offline'))).toBe('unknown')
  })
  it('member-session and extract-expense read the caller address the same way', () => {
    expect(clientIp).toBe(sharedClientIp)
    const extract = readFileSync('supabase/functions/extract-expense/index.ts', 'utf8')
    expect(extract).toContain(`import { clientIp } from '../_shared/client-ip.ts'`)
    expect(extract).toContain('enforceRateLimit(supabase, clientIp(req))')
    expect(extract).not.toMatch(/headers\.get\(['"](?:x-forwarded-for|cf-connecting-ip|x-real-ip)/i)
  })
  it.each([0, NaN, undefined])('fails closed on invalid rate-backend counts (%#)', async count => {
    const { deps } = harness(); deps.bump.mockResolvedValue(count as number)
    expect((await createMemberHandler(deps)(request())).status).toBe(503)
    expect(deps.issueSession).not.toHaveBeenCalled()
  })
  it('fails closed and sanitizes backend failures', async () => {
    const { deps } = harness(); deps.bump.mockRejectedValue(new Error('private transport detail'))
    const res = await createMemberHandler(deps)(request()); expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('private'); expect(deps.issueSession).not.toHaveBeenCalled()
  })
  it.each([
    { expires_at: now / 1000 - 1 }, { expires_at: now / 1000 }, { expires_at: now / 1000 + 3600 },
    { expires_in: 3600 }, { refresh_token: '' }, { user: { ...session.user, id: 'another-user' } },
    { user: { ...session.user, app_metadata: { boatbuddy_member: false } } },
  ])('refuses expired, overlong or nonmember sessions (%#)', async patch => {
    const { deps } = harness(); deps.issueSession.mockResolvedValue({ ...session, ...patch })
    const res = await createMemberHandler(deps)(request()); expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('fixture-access')
  })
  it('handles preflight without spending a login attempt', async () => {
    const { handle, deps } = harness()
    expect((await handle(new Request('http://offline', { method: 'OPTIONS' }))).status).toBe(204)
    expect(deps.bump).not.toHaveBeenCalled()
    expect((await handle(new Request('http://offline'))).status).toBe(405)
  })
})

describe('member-only extraction boundary', () => {
  it.each([undefined, 'Bearer public-key', 'Bearer expired', 'Bearer forged'])('refuses unverified callers (%#)', async header => {
    const client = { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('invalid') })) } }
    expect(await requireMember(new Request('http://offline', { headers: header ? { authorization: header } : {} }), client)).toBe(false)
  })
  it('accepts only verified server-managed membership', async () => {
    const getUser = vi.fn(async () => ({ data: { user: session.user }, error: null }))
    expect(await requireMember(new Request('http://offline', { headers: { authorization: 'Bearer fixture' } }), { auth: { getUser } })).toBe(true)
    expect(getUser).toHaveBeenCalledWith('fixture')
  })
  it('refuses a normal authenticated nonmember', async () => {
    const client = { auth: { getUser: async () => ({ data: { user: { app_metadata: {} } }, error: null }) } }
    expect(await requireMember(new Request('http://offline', { headers: { authorization: 'Bearer fixture' } }), client)).toBe(false)
  })
})

it('backfill requires the server credential, not an anon or member JWT', () => {
  for (const value of ['', 'public-key', 'member-token']) {
    expect(requireService(new Request('http://offline', { headers: { authorization: `Bearer ${value}` } }), ['fixture-service'])).toBe(false)
  }
  expect(requireService(new Request('http://offline', { headers: { apikey: 'fixture-service' } }), ['fixture-service'])).toBe(true)
  expect(requireService(new Request('http://offline'), [undefined, ''])).toBe(false)
})
