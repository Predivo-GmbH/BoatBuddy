import { isIP } from 'node:net'

/**
 * The caller's address, or `null` when no trustworthy client address is present. ONE
 * definition for every function (member-session and extract-expense).
 *
 * Order (review of PR #38, 2026-11-04):
 * 1. `cf-connecting-ip` when it holds a valid PUBLIC address. Supabase Edge Functions sit
 *    behind Cloudflare, which OVERWRITES this header with the address that connected to it,
 *    so a value the caller sends never survives.
 * 2. Otherwise the RIGHTMOST `X-Forwarded-For` entry, the one the last proxy appended.
 *    Never the leftmost: a caller who sends `X-Forwarded-For: spoofed` arrives as
 *    `spoofed, <real address>` (github.com/orgs/supabase/discussions/34647), and SR-FN-07
 *    forbids keying a limit on a value the caller can fake.
 * 3. Otherwise `null`. A missing, malformed or PRIVATE address (a gateway's own internal
 *    address, shared by every caller) is not a client. Callers must then skip the
 *    per-address limit and rely on their global budgets alone: keying everyone into one
 *    'unknown' bucket would let ten attempts lock every member out.
 */
export function clientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')?.trim() ?? ''
  if (isPublicIp(cf)) return cf
  const rightmost = rightmostForwarded(req)
  return isPublicIp(rightmost) ? rightmost : null
}

function rightmostForwarded(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? ''
}

/** A syntactically valid IP that is not private, loopback, link-local, CGNAT or unspecified. */
export function isPublicIp(value: string): boolean {
  const family = isIP(value)
  if (family === 4) return !isPrivateV4(value)
  if (family === 6) {
    const v = value.toLowerCase()
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return !isPrivateV4(mapped[1])
    if (v === '::' || v === '::1') return false
    // fc00::/7 unique local, fe80::/10 link-local (a full four-digit first group; a shorter
    // group such as `fc1:` has implied leading zeros and is outside both ranges).
    return !/^f[cd][0-9a-f]{2}:/.test(v) && !/^fe[89ab][0-9a-f]:/.test(v)
  }
  return false
}

function isPrivateV4(value: string): boolean {
  const [a, b] = value.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 carrier-grade NAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
}

/**
 * The SHAPE of the address headers, never an address: how many X-Forwarded-For entries,
 * whether its rightmost entry equals cf-connecting-ip, whether that entry is private.
 */
export function headerShape(req: Request) {
  const xff = req.headers.get('x-forwarded-for')
  const rightmost = rightmostForwarded(req)
  const cf = req.headers.get('cf-connecting-ip')?.trim() ?? ''
  return {
    xffEntries: xff ? xff.split(',').length : 0,
    cfPresent: cf !== '',
    cfValidPublic: isPublicIp(cf),
    rightmostEqualsCf: rightmost !== '' && rightmost === cf,
    rightmostValid: isIP(rightmost) !== 0,
    rightmostPrivate: isIP(rightmost) !== 0 && !isPublicIp(rightmost),
    resolved: clientIp(req) === null ? 'none' : (isPublicIp(cf) ? 'cf-connecting-ip' : 'x-forwarded-for'),
  }
}

export const STAGING_PROJECT_REF = 'svpewgbwousyheohlrtt'

/** True only for the staging project's own URL; production (any other URL) is always false. */
export function isStagingProject(supabaseUrl: string | undefined): boolean {
  return supabaseUrl === `https://${STAGING_PROJECT_REF}.supabase.co`
}

let shapeLogged = false
/**
 * Staging-only diagnostic: logs the header SHAPE once per cold start (module instance),
 * so the address source can be confirmed on the real platform. Off unless `enabled`
 * (callers pass `isStagingProject(SUPABASE_URL)`), so it never runs in production.
 */
export function logHeaderShapeOnce(req: Request, label: string, enabled: boolean, log: (line: string) => void = console.log): void {
  if (!enabled || shapeLogged) return
  shapeLogged = true
  log(`${label} client-address header shape (staging only, no addresses): ${JSON.stringify(headerShape(req))}`)
}

/** Test hook: a fresh module instance (cold start) logs again. */
export function resetHeaderShapeLogForTests(): void {
  shapeLogged = false
}
