import { timingSafeEqual, createHash, createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { jsonResponse, MEMBER_CORS, readBoundedBody } from '../_shared/member-http.ts'

export const ACCESS_SECONDS = 900
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
  bump: (key: string, window: string) => Promise<number>
  issueSession: () => Promise<MemberSession>
  now?: () => number
}

export function passwordMatches(password: string, hash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Gate not configured')
  return timingSafeEqual(createHash('sha256').update(password, 'utf8').digest(), Buffer.from(hash, 'hex'))
}

export function clientIp(req: Request): string {
  // Use the rightmost proxy-appended hop, never a caller-prepended first hop.
  // A global budget also bounds guesses if a proxy changes its forwarding rules.
  const ip = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? ''
  return isIP(ip) ? ip : 'unknown'
}

export function createMemberHandler(deps: GateDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: MEMBER_CORS })
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
    const now = Math.floor((deps.now?.() ?? Date.now()) / 1000)
    try {
      if (!/^[a-f0-9]{64}$/i.test(deps.passwordHash)) throw new Error('configuration')
      // Cross-isolate atomic counters. Fail closed on transport/SQL errors.
      const hour = Math.floor(now / 3600) * 3600
      const quarter = Math.floor(now / 900) * 900
      const global = await deps.bump('member-login:global', new Date(hour * 1000).toISOString())
      if (!Number.isInteger(global) || global < 1) throw new Error('rate backend')
      if (global > 60) return jsonResponse({ error: 'Too many attempts' }, 429, { 'Retry-After': String(hour + 3600 - now) })
      const ipKey = createHmac('sha256', deps.passwordHash).update(clientIp(req)).digest('hex')
      const attempts = await deps.bump(`member-login:ip:${ipKey}`, new Date(quarter * 1000).toISOString())
      if (!Number.isInteger(attempts) || attempts < 1) throw new Error('rate backend')
      if (attempts > 10) return jsonResponse({ error: 'Too many attempts' }, 429, { 'Retry-After': String(quarter + 900 - now) })
      let password: unknown
      try {
        if (!req.headers.get('content-type')?.startsWith('application/json')) throw new Error('content type')
        const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(req, 2048)))
        password = body.password
      } catch { return jsonResponse({ error: 'Invalid request' }, 400) }
      if (typeof password !== 'string' || password.length > 512) return jsonResponse({ error: 'Invalid request' }, 400)
      if (!passwordMatches(password, deps.passwordHash)) return jsonResponse({ error: 'Falsches Passwort' }, 401)
      const session = await deps.issueSession()
      const issuedNow = Math.floor((deps.now?.() ?? Date.now()) / 1000)
      // Refuse misconfigured TTLs/identities instead of handing out a longer pass.
      if (session.user.id !== SHARED_MEMBER_ID || session.user.app_metadata.boatbuddy_member !== true ||
          !session.access_token || !session.refresh_token || session.token_type !== 'bearer' ||
          !Number.isFinite(session.expires_at) || session.expires_at <= issuedNow || session.expires_at > issuedNow + ACCESS_SECONDS ||
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
