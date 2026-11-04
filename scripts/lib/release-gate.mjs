// Release gates for migrations that must wait until a front end is LIVE.
//
// WHY (2026-11-04, review of PR #38). The deploy jobs apply migrations BEFORE they upload
// the new front end (and staging even before its tests). A migration that removes what
// the OLD front end uses therefore cuts the live site off for the minutes in between, and
// for good if a later step fails. Such a migration is marked on its FIRST line:
//
//   -- release-gate: <name>
//
// and apply-migrations.mjs applies it only when BOTH hold:
//   1. supabase/release-gates.json sets <name> to true. A later PR flips it, so the
//      second step is a decision in the repository, never a side effect of a deploy.
//   2. the environment's LIVE site proves it already serves the front end the gate
//      waits for (for member-frontend-live: /release.json says {"memberSession": true}).
// Otherwise the migration and everything after it are DEFERRED: not applied, not
// recorded, named in the log. The next run of that environment tries again.
import fs from 'node:fs'

const GATE_LINE = /^--\s*release-gate:\s*([a-z0-9-]+)\s*$/

/** The gate named on a migration's first line, or null. Only the first line counts. */
export function gateOf(sql) {
  const first = sql.replace(/^﻿/, '').split(/\r?\n/, 1)[0]
  return GATE_LINE.exec(first)?.[1] ?? null
}

export function loadGates(file = 'supabase/release-gates.json') {
  const gates = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) throw new Error('release-gates.json must be an object')
  return gates
}

// What each gate needs to see on the live site. Unknown gate names never open.
export const LIVE_CHECKS = Object.freeze({
  'member-frontend-live': Object.freeze({ path: '/release.json', field: 'memberSession' }),
})

/**
 * Does the LIVE site serve the front end this gate waits for? Fails closed: any transport
 * error, redirect, non-200, non-JSON (the old front end answers /release.json with its SPA
 * index.html) or a missing field reads as "not live".
 */
export async function liveSiteReady(name, { siteUrl, fetchImpl = fetch, basicAuth } = {}) {
  const check = LIVE_CHECKS[name]
  if (!check) return { ready: false, reason: `no live check is defined for gate "${name}"` }
  if (!siteUrl || !/^https:\/\/[a-z0-9.-]+$/i.test(siteUrl)) return { ready: false, reason: 'no https --site-url given' }
  const url = `${siteUrl}${check.path}?t=${Date.now()}`
  const headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' }
  if (basicAuth?.user && basicAuth?.pass) {
    headers.Authorization = `Basic ${Buffer.from(`${basicAuth.user}:${basicAuth.pass}`).toString('base64')}`
  }
  let response
  try {
    response = await fetchImpl(url, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  } catch {
    return { ready: false, reason: `${siteUrl}${check.path} unreachable` }
  }
  if (response.status !== 200) {
    await response.body?.cancel()
    return { ready: false, reason: `${siteUrl}${check.path} answered HTTP ${response.status}` }
  }
  let body
  try { body = JSON.parse(await response.text()) } catch {
    return { ready: false, reason: `${siteUrl}${check.path} is not the member build (not JSON; the old front end serves its page here)` }
  }
  if (body?.[check.field] !== true) return { ready: false, reason: `${siteUrl}${check.path} does not report ${check.field}: true` }
  return { ready: true, reason: `${siteUrl}${check.path} reports ${check.field}: true` }
}

/** Should a migration carrying gate `name` be applied now? */
export async function gateOpen(name, { gates, ...live }) {
  if (gates?.[name] !== true) {
    return { open: false, reason: `gate "${name}" is off in supabase/release-gates.json (a later PR turns it on)` }
  }
  const site = await liveSiteReady(name, live)
  return site.ready ? { open: true, reason: site.reason } : { open: false, reason: site.reason }
}

/**
 * Split pending migrations into the ones to apply now and the ones deferred. The first
 * migration whose gate is closed defers itself AND every later one: migrations are ordered.
 */
export async function planPending(pending, { readSql, gates, ...live }) {
  const apply = []
  for (let i = 0; i < pending.length; i++) {
    const gate = gateOf(readSql(pending[i]))
    if (gate) {
      const decision = await gateOpen(gate, { gates, ...live })
      if (!decision.open) return { apply, deferred: pending.slice(i), gate, enabled: gates?.[gate] === true, reason: decision.reason }
    }
    apply.push(pending[i])
  }
  return { apply, deferred: [], gate: null, enabled: null, reason: null }
}
