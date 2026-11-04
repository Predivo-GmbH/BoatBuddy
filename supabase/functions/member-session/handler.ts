import { timingSafeEqual, createHash, createHmac } from 'node:crypto'
import { jsonResponse, MEMBER_CORS, readBoundedBody } from '../_shared/member-http.ts'
import { clientIp } from '../_shared/client-ip.ts'
export { clientIp }

export const ACCESS_SECONDS = 900
// Auth's clock and this isolate's clock are different machines: a session stamped a few
// seconds ahead of ours is still the 15-minute session, not a longer pass.
export const CLOCK_TOLERANCE_SECONDS = 5
// Per caller address: every attempt counts, 10 per 15 minutes. Applied only when the
// request carries a trustworthy client address (_shared/client-ip.ts); without one there is
// no per-address bucket at all, so no shared gateway address can lock every member out.
export const IP_LIMIT = 10
// Everyone together: only WRONG passwords count, 60 per hour. Members typing the right
// password, preflights and malformed requests never use it up, so no amount of ordinary
// traffic locks the boat out; a distributed guesser is still bounded at 60 guesses/hour.
export const WRONG_GLOBAL_LIMIT = 60
export const WRONG_GLOBAL_KEY = 'member-login:wrong'
export const SHARED_MEMBER_ID = '07a91df9-55d7-42b4-9944-82f5b88dcf7e'
export const MEMBER_EMAIL = 'members@boatbuddy.invalid'

export interface MemberSession {
  access_token: string
  refresh_token: string
  expires_at: number
  expires_in: number
  token_type: string
  user: { id: string; app_metadata: Record<string, unknown> }
}

export interface GateDependencies {
  passwordHash: string
  /** Atomically add one to the counter and return the new count. */
  bump: (key: string, window: string) => Promise<number>
  /** Read a counter without changing it (0 when absent). */
  peek: (key: string, window: string) => Promise<number>
  issueSession: () => Promise<MemberSession>
  now?: () => number
}

export function passwordMatches(password: string, hash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Gate not configured')
  return timingSafeEqual(createHash('sha256').update(password, 'utf8').digest(), Buffer.from(hash, 'hex'))
}

export function createMemberHandler(deps: GateDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: MEMBER_CORS })
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
    const now = Math.floor((deps.now?.() ?? Date.now()) / 1000)
    try {
      if (!/^[a-f0-9]{64}$/i.test(deps.passwordHash)) throw new Error('configuration')
      // Cross-isolate atomic counters. Fail closed on transport/SQL errors.
      // 1. Per caller address FIRST, counting every attempt: one address can never spend
      //    the shared budget below (10 per 15 min = at most 40 of its 60 per hour).
      //    No trustworthy address: skip this step; the wrong-password budget still bounds it.
      const hour = Math.floor(now / 3600) * 3600
      const quarter = Math.floor(now / 900) * 900
      const hourWindow = new Date(hour * 1000).toISOString()
      const ip = clientIp(req)
      if (ip !== null) {
        const ipKey = createHmac('sha256', deps.passwordHash).update(ip).digest('hex')
        const attempts = await deps.bump(`member-login:ip:${ipKey}`, new Date(quarter * 1000).toISOString())
        if (!Number.isInteger(attempts) || attempts < 1) throw new Error('rate backend')
        if (attempts > IP_LIMIT) return jsonResponse({ error: 'Too many attempts' }, 429, { 'Retry-After': String(quarter + 900 - now) })
      }
      // 2. The shared wrong-password budget is READ here and spent only below, on a wrong
      //    password. Once it is used up every attempt is refused WITHOUT comparing, so the
      //    61st guess cannot learn that it was right. Simultaneous wrong guesses can pass
      //    this read together; step 1 bounds each source.
      const wrong = await deps.peek(WRONG_GLOBAL_KEY, hourWindow)
      if (!Number.isInteger(wrong) || wrong < 0) throw new Error('rate backend')
      if (wrong >= WRONG_GLOBAL_LIMIT) return jsonResponse({ error: 'Too many attempts' }, 429, { 'Retry-After': String(hour + 3600 - now) })
      let password: unknown
      try {
        if (!req.headers.get('content-type')?.startsWith('application/json')) throw new Error('content type')
        const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(req, 2048)))
        password = body.password
      } catch { return jsonResponse({ error: 'Invalid request' }, 400) }
      if (typeof password !== 'string' || password.length > 512) return jsonResponse({ error: 'Invalid request' }, 400)
      if (!passwordMatches(password, deps.passwordHash)) {
        const spent = await deps.bump(WRONG_GLOBAL_KEY, hourWindow)
        if (!Number.isInteger(spent) || spent < 1) throw new Error('rate backend')
        return jsonResponse({ error: 'Falsches Passwort' }, 401)
      }
      const session = await deps.issueSession()
      const issuedNow = Math.floor((deps.now?.() ?? Date.now()) / 1000)
      // Refuse misconfigured TTLs/identities instead of handing out a longer pass.
      if (session.user.id !== SHARED_MEMBER_ID || session.user.app_metadata.boatbuddy_member !== true ||
          !session.access_token || !session.refresh_token || session.token_type !== 'bearer' ||
          !Number.isFinite(session.expires_at) || session.expires_at <= issuedNow || session.expires_at > issuedNow + ACCESS_SECONDS + CLOCK_TOLERANCE_SECONDS ||
          !Number.isFinite(session.expires_in) || session.expires_in <= 0 || session.expires_in > ACCESS_SECONDS) throw new Error('session contract')
      return jsonResponse({
        access_token: session.access_token, refresh_token: session.refresh_token,
        expires_at: session.expires_at, expires_in: session.expires_in, token_type: session.token_type,
      })
    } catch {
      // No credentials, request bodies, Auth responses or transport errors in logs.
      return jsonResponse({ error: 'Anmeldung vorübergehend nicht möglich' }, 503)
    }
  }
}
