import { isIP } from 'node:net'

/**
 * The caller's address as Supabase's gateway sees it. ONE definition for every function
 * (member-session and extract-expense used opposite ends of the header until 2026-11-04).
 *
 * Supabase documents `X-Forwarded-For` as the place to read the client IP
 * (https://supabase.com/docs/guides/api/securing-your-api, "accessing request
 * information"). Its gateway APPENDS the address it received the connection from; it does
 * not replace a header the caller sent. A caller who sends `X-Forwarded-For: spoofed`
 * arrives as `spoofed, <real address>` (observed: github.com/orgs/supabase/discussions/34647).
 * The docs' "before the first comma" therefore returns whatever the caller typed whenever
 * the caller sends the header, and SR-FN-07 forbids keying a limit on a value the caller can
 * fake. So: the RIGHTMOST entry, the one the gateway appended. A value that is not an IP
 * address groups into 'unknown'; the global budgets still bound that group.
 */
export function clientIp(req: Request): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? ''
  return isIP(ip) ? ip : 'unknown'
}
