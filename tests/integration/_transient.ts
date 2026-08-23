/**
 * Transient-upstream guard for the staging integration suite.
 */
// Staging PostgREST sits behind Cloudflare. When it hiccups it answers with an HTML
// error page, which supabase-js surfaces as { message: '<html>...502 Bad Gateway...' }.
// That is an INFRASTRUCTURE outage, not a defect in the commit under test - but the
// gate reported it as a plain assertion failure and blocked a production promotion
// (run 32627468933, 2026-08-23: tests 2, 4 and 7 failed on scattered 502s; the
// identical commit passed on rerun). Retry those, and if they persist, fail with a
// message that says what actually broke.
export const TRANSIENT =
  /<html|502 Bad Gateway|503 Service|504 Gateway|Gateway Time-?out|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i

export const isTransient = (e: { message?: string } | null | undefined): boolean =>
  !!e?.message && TRANSIENT.test(e.message)

// Wraps one Supabase call. ONLY transient transport errors are retried - a real
// Postgres error (e.g. the 23505 unique violation that one test deliberately
// expects) returns on the first attempt and is asserted on exactly as before.
export async function q<T extends { error: { message?: string } | null }>(
  run: () => PromiseLike<T>,
  attempts = 4,
): Promise<T> {
  let last = await run()
  for (let i = 1; i < attempts && isTransient(last.error); i++) {
    await new Promise((r) => setTimeout(r, 400 * 2 ** (i - 1)))
    last = await run()
  }
  if (isTransient(last.error)) {
    const detail = String(last.error!.message).replace(/\s+/g, ' ').slice(0, 120)
    throw new Error(
      `staging Supabase unreachable after ${attempts} attempts: ${detail} - ` +
        'infrastructure outage, NOT a failure of the commit under test.',
    )
  }
  return last
}

