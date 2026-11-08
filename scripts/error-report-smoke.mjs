#!/usr/bin/env node
// Release smoke for the customer error notice (Roger 08.11.2026, contract
// C:/Business/Audits/CONTRACT-customer-error-message-2026-11-08.md).
//
// The new front end tells a member "Unser Team wurde automatisch benachrichtigt" only when
// report-client-error answers 200 with a reference. This proves, in the environment just
// deployed, that it does, and that the reference really is a stored row:
// 1. POST one synthetic report (screen release-smoke, no user, a non-browser user agent, so
//    the real-customer watcher never counts it as a person) -> 200 + E-XXXXXX;
// 2. read client_error_reports through the Management API -> exactly that row exists.
// The deploy jobs run it AFTER the edge functions and BEFORE the front end upload: if it fails,
// the old front end (which never calls the function) stays live.
//
// It prints the reference and nothing else from the answer. No key or token is ever printed.
//
//   node scripts/error-report-smoke.mjs --environment staging|production
//   env: SUPABASE_PUBLIC_KEY (that project's publishable key, a public value)
//        SUPABASE_ACCESS_TOKEN (Management API, to read the row back)
import { pathToFileURL } from 'node:url'

export const PROJECTS = Object.freeze({ staging: 'svpewgbwousyheohlrtt', production: 'xzythvxmuxmczuiophwp' })
export const REFERENCE = /^E-[A-Z2-9]{6}$/
export const SMOKE_SCREEN = 'release-smoke'

export async function runSmoke({ environment, publicKey, accessToken, version = 'unknown', fetchImpl = fetch }) {
  const ref = PROJECTS[environment]
  if (!ref) throw new Error('--environment must be staging or production')
  if (!publicKey) throw new Error('SUPABASE_PUBLIC_KEY is not set: the error report is untested')
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is not set: the stored row cannot be checked')
  let reference = null
  let status = 0
  for (let attempt = 1; attempt <= 3 && reference === null; attempt++) {
    try {
      const res = await fetchImpl(`https://${ref}.supabase.co/functions/v1/report-client-error`, {
        method: 'POST',
        headers: {
          apikey: publicKey, Authorization: `Bearer ${publicKey}`, 'Content-Type': 'application/json',
          'User-Agent': 'boatbuddy-release-smoke',
        },
        body: JSON.stringify({
          area: 'other', screen: SMOKE_SCREEN, action: 'errorReportSmoke', status: null,
          message: `release smoke ${environment}`, app_version: /^[A-Za-z0-9_.+-]{1,40}$/.test(version) ? version : null,
        }),
        redirect: 'error', signal: AbortSignal.timeout(30_000),
      })
      status = res.status
      const body = await res.json().catch(() => null)
      if (res.status === 200 && typeof body?.reference === 'string' && REFERENCE.test(body.reference)) reference = body.reference
      else if (res.status < 500) break
    } catch { status = 0 }
    if (reference === null && attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000 * attempt))
  }
  if (reference === null) throw new Error(`report-client-error (${environment}) did not answer 200 with a reference (HTTP ${status})`)
  // The reference matched REFERENCE above, so it is safe inside the literal.
  const sql = `select count(*)::int as n from public.client_error_reports where reference = '${reference}' and screen = '${SMOKE_SCREEN}'`
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }), redirect: 'error', signal: AbortSignal.timeout(30_000),
  })
  const rows = await res.json().catch(() => null)
  if (!res.ok || !Array.isArray(rows) || rows[0]?.n !== 1) {
    throw new Error(`report-client-error (${environment}) answered ${reference}, but that row was not found (HTTP ${res.status})`)
  }
  return reference
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const environment = process.argv[process.argv.indexOf('--environment') + 1]
  try {
    const reference = await runSmoke({
      environment, publicKey: process.env.SUPABASE_PUBLIC_KEY, accessToken: process.env.SUPABASE_ACCESS_TOKEN,
      version: (process.env.GITHUB_SHA ?? 'local').slice(0, 12),
    })
    console.log(`error report (${environment}): stored and answered with reference ${reference}`)
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exitCode = 1
  }
}
