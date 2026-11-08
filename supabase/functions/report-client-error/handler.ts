// report-client-error: a member's screen showed a server error; record it so we hear about it
// within minutes, and answer with the reference the screen shows.
//
// Contract: C:/Business/Audits/CONTRACT-customer-error-message-2026-11-08.md (Roger 08.11: "UX for
// the user himself so that he knows we have recognized the issue and the tech team is taking care
// of it ... moment it happens"). The screen says "our team has been notified" ONLY after this
// function answered 200 with a reference, and it answers 200 ONLY after the row is stored.
//
// Works signed in or not (the sign-in screen reports too). Stores the user id when the caller is
// signed in, never an e-mail address. Removes e-mail addresses, tokens and long random strings
// from the message before storing it. At most 20 reports an hour per caller address (per user
// when no trustworthy address is present), 500 an hour for everyone together.
import { createHmac } from 'node:crypto'
import { jsonResponse, MEMBER_CORS, readBoundedBody } from '../_shared/member-http.ts'
import { clientIp } from '../_shared/client-ip.ts'

export const AREAS = ['money', 'signin', 'other'] as const
export type Area = typeof AREAS[number]
export const BODY_LIMIT = 4096
export const MESSAGE_LIMIT = 500
export const CALLER_LIMIT = 20
export const GLOBAL_LIMIT = 500
export const GLOBAL_KEY = 'client-error:all'
// The same shape the 5-minute watcher reads back out of the log line (production-monitor
// check-real-customer-errors.mjs CLIENT_ERROR_LINE), so every stored screen name is countable.
export const NAME = /^[A-Za-z0-9_./:-]{1,60}$/
export const VERSION = /^[A-Za-z0-9_.+-]{1,40}$/
export const REFERENCE = /^E-[A-Z2-9]{6}$/
// 32 letters and digits without 0/O and 1/I, so a reference read out over the phone is unambiguous.
// 256 is a multiple of 32, so a random byte maps onto it without bias.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface ReportRow {
  reference: string
  area: Area
  screen: string
  action: string
  status: number | null
  message: string
  app_version: string | null
  user_id: string | null
}

export interface ReportDependencies {
  /** Key for hashing the caller address: the address itself is never stored or logged. */
  hmacKey: string
  /** Atomically add one to the counter and return the new count (bump_extract_rate). */
  bump: (key: string, window: string) => Promise<number>
  /** The signed-in user's id for a bearer token, or null (anonymous key, expired, invalid). */
  userIdOf: (bearer: string) => Promise<string | null>
  /** Insert the row and confirm it exists. 'duplicate' = the reference is taken, try another. Throws otherwise. */
  store: (row: ReportRow) => Promise<'stored' | 'duplicate'>
  now?: () => number
  newReference?: () => string
  log?: (line: string) => void
}

export function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `E-${[...bytes].map(b => REFERENCE_ALPHABET[b % 32]).join('')}`
}

const EMAIL = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g
const API_KEY = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g
const BEARER = /\bBearer\s+[^\s"',;]+/gi
const NAMED_SECRET = /\b(token|apikey|api_key|access_token|refresh_token|secret|password|passwort|key)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi
const LONG_RUN = /[A-Za-z0-9_+/=.-]{20,}/g

/** The message with e-mail addresses, tokens and long random strings removed, bounded to 500 characters. */
export function scrubMessage(raw: string): string {
  return raw
    .replace(/\p{Cc}+/gu, ' ')
    .replace(EMAIL, '[e-mail]')
    .replace(JWT, '[token]')
    .replace(API_KEY, '[token]')
    .replace(BEARER, 'Bearer [token]')
    .replace(NAMED_SECRET, (_m, name: string, sep: string) => `${name}${sep}[token]`)
    // A long run that mixes letters and digits is an id, a hash or a key. Words, even long
    // function names such as create_nutzungslog_atomic, have no digits and stay readable.
    .replace(LONG_RUN, run => /\d/.test(run) && /[A-Za-z]/.test(run) ? '[entfernt]' : run)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MESSAGE_LIMIT)
}

type Parsed = { ok: true, row: Omit<ReportRow, 'reference' | 'user_id'> } | { ok: false }

export function parseReport(body: unknown): Parsed {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  const b = body as Record<string, unknown>
  const area = b.area
  if (typeof area !== 'string' || !(AREAS as readonly string[]).includes(area)) return { ok: false }
  if (typeof b.screen !== 'string' || !NAME.test(b.screen)) return { ok: false }
  if (typeof b.action !== 'string' || !NAME.test(b.action)) return { ok: false }
  const status = b.status === undefined || b.status === null ? null : b.status
  if (status !== null && (typeof status !== 'number' || !Number.isInteger(status) || status < 0 || status > 599)) return { ok: false }
  if (typeof b.message !== 'string') return { ok: false }
  const version = typeof b.app_version === 'string' && VERSION.test(b.app_version) ? b.app_version : null
  return {
    ok: true,
    row: { area: area as Area, screen: b.screen, action: b.action, status, message: scrubMessage(b.message), app_version: version },
  }
}

export function createReportHandler(deps: ReportDependencies) {
  const log = deps.log ?? console.log
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: MEMBER_CORS })
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
    let body: unknown
    try {
      if (!req.headers.get('content-type')?.startsWith('application/json')) return jsonResponse({ error: 'Invalid request' }, 400)
      const bytes = await readBoundedBody(req, BODY_LIMIT)
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch (error) {
      if (error instanceof Error && error.message === 'body limit') return jsonResponse({ error: 'Request too large' }, 413)
      return jsonResponse({ error: 'Invalid request' }, 400)
    }
    const parsed = parseReport(body)
    if (!parsed.ok) return jsonResponse({ error: 'Invalid request' }, 400)
    const { row } = parsed
    // The ONE line the watcher counts (no user, no address, no message): written for every
    // accepted report, also when storing it fails, because that is when we most need to hear.
    const line = `client_error area=${row.area} screen=${row.screen}`

    const now = deps.now?.() ?? Date.now()
    const hour = new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString()
    const authorization = req.headers.get('authorization') ?? ''
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    const overLimit = async (key: string, limit: number) => {
      const count = await deps.bump(key, hour)
      if (!Number.isInteger(count) || count < 1) throw new Error('rate backend')
      return count > limit
    }
    let userId: string | null
    try {
      // The caller address is limited BEFORE anything is asked of Auth: a flood costs one counter each.
      const ip = clientIp(req)
      if (ip !== null && await overLimit(`client-error:ip:${createHmac('sha256', deps.hmacKey).update(ip).digest('hex')}`, CALLER_LIMIT)) {
        return jsonResponse({ error: 'Too many reports' }, 429)
      }
      userId = bearer ? await deps.userIdOf(bearer).catch(() => null) : null
      // No trustworthy address: per user, and everyone signed out shares one bucket.
      if (ip === null && await overLimit(userId !== null ? `client-error:user:${userId}` : 'client-error:anonymous', CALLER_LIMIT)) {
        return jsonResponse({ error: 'Too many reports' }, 429)
      }
      if (await overLimit(GLOBAL_KEY, GLOBAL_LIMIT)) return jsonResponse({ error: 'Too many reports' }, 429)
    } catch {
      // The counters live in the same database as the reports: unavailable means not stored.
      log(`${line} stored=no`)
      return jsonResponse({ error: 'Report not stored' }, 503)
    }

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const reference = (deps.newReference ?? newReference)()
        if (!REFERENCE.test(reference)) throw new Error('reference')
        if (await deps.store({ ...row, reference, user_id: userId }) === 'stored') {
          log(line)
          return jsonResponse({ reference })
        }
      }
      throw new Error('no free reference')
    } catch {
      log(`${line} stored=no`)
      return jsonResponse({ error: 'Report not stored' }, 503)
    }
  }
}
