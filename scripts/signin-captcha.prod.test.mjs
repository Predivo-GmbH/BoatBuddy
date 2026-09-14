#!/usr/bin/env node
/**
 * signin-captcha.prod.test.mjs — production/staging regression guard for the unauthenticated
 * sign-in-email hole on BoatBuddy.
 *
 * THE VULNERABILITY (verified live 2026-09-14, and reproduced again while writing this guard):
 * BoatBuddy's Supabase Auth (GoTrue) accepts a TOKENLESS, unauthenticated
 * POST /auth/v1/recover — no captcha challenge, no session, nothing. GoTrue's own design
 * always answers 200 with an empty body for /recover (so the endpoint can't be used to test
 * whether an address has an account) — but that same design means a fully open project takes
 * unlimited unauthenticated recovery-mail requests from anyone on the internet, with only
 * Supabase's own per-address rate limiter standing in the way. Live: POST /auth/v1/recover
 * with the reserved probe address below returns exactly `{}` / HTTP 200 today.
 *
 * BOATBUDDY IS NOT LIKE THE OTHER FLEET PRODUCTS THIS SWEEP TOUCHED: it has NO client-side
 * Supabase Auth call sites at all. Verified this session by:
 *   - grepping the whole repo (src/, supabase/functions/, e2e/, tests/, scripts/, docs/) for
 *     signInWith*, auth.signUp, resetPasswordForEmail, supabase.auth.*, verifyOtp, gotrue,
 *     and any literal /auth/v1/ reference — the only hits are THIS file, this repo's
 *     docs/Credentials.txt notes, and .github/workflows/keep-alive.yml's daily liveness ping
 *     (a fixed, nonexistent keepalive@ping.local / dummy-password POST to
 *     /auth/v1/token?grant_type=password, used only to prove the project isn't paused — it is
 *     not a real login and carries no user credentials);
 *   - reading src/lib/supabase.ts (one createClient(url, anonKey), used only for
 *     Postgres/PostgREST table reads — .auth is never touched);
 *   - reading src/components/shared/PasswordGate.tsx, the app's actual access control: a
 *     client-side SHA-256 comparison against a hash baked into the build
 *     (VITE_GATE_PASSWORD_HASH), gating a sessionStorage flag — Supabase Auth plays no part;
 *   - reading both Supabase Edge Functions (backfill-reservierungen, extract-expense): both
 *     call createClient with a service-role/anon key for data operations only; neither touches
 *     supabase.auth.admin or any GoTrue endpoint;
 *   - e2e/staging/authenticated.spec.ts's "authenticated" is the SAME PasswordGate bypass
 *     (sessionStorage.setItem('boatbuddy-unlocked', 'true')), not a Supabase session — confirmed
 *     by e2e/staging/gate-a.config.ts's own comment: "AUTH MODEL: no user login at all";
 *   - scripts/guard-credential-files.mjs's own header: "BoatBuddy has no user accounts".
 * auth.users itself was also queried directly (service-role-equivalent, via the Management
 * API's database/query endpoint, token read in-process from docs/Credentials.txt / env,
 * never printed): 0 rows on production AND 0 on staging. Nobody has ever signed up.
 *
 * SO THE FIX HERE IS NOT "thread a captcha token through call sites" — there are none to
 * thread it through, and writing client code that calls a Supabase Auth method this app does
 * not otherwise use would be new attack surface for no reason. The recommended fix is
 * STRONGER than captcha and matches the fact that this project has no legitimate use for
 * Supabase's built-in email auth at all: turn the project's email auth provider OFF
 * (`external_email_enabled: false`). That removes the mail path entirely rather than merely
 * gating it, and it is the correct choice specifically BECAUSE zero code in this repo depends
 * on email/password/OTP/recovery Auth working. Captcha (matching ReplyFlow's fix) is the
 * fallback ONLY if some future code path turns out to need email auth after all.
 *
 * Both are Supabase Auth-settings changes — a production switch, Roger's call, applied via
 * the Management API, never by this script. This script only PROBES the live state.
 *
 * WHY THIS GUARD CHECKS FOR *EITHER* CLOSED STATE, NOT JUST CAPTCHA:
 * unlike ReplyFlow (which still needs email auth to work, so captcha is the only viable fix),
 * a BoatBuddy project can be closed two different ways, and both are legitimate:
 *   - security_captcha_enabled = true (GoTrue then answers 400 with a captcha-shaped error), or
 *   - external_email_enabled = false (GoTrue then answers with an email_provider_disabled-shaped
 *     error — a project that cannot send auth mail at all has no hole to close).
 * This guard treats a tokenless /recover request refused for EITHER reason as CLOSED, and
 * always prints which one it found, rather than hard-coding an expectation of captcha.
 *
 * CREDENTIAL-FREE BY DESIGN, exactly like replyflow/supabase/functions/_shared/
 * signin-captcha.prod.test.mjs: the anon/publishable key this probe needs is PUBLIC (it ships
 * in every visitor's browser). For production it is read from the live bundle at
 * boatbuddy.predivo.ch; for staging (which sits behind HTTP basic auth, so the bundle can't be
 * fetched anonymously) it is read from $STAGING_ANON_KEY when set, and otherwise from the
 * Supabase Management API's own api-keys list (same fallback order and reasoning as ReplyFlow's
 * guard: bundle-first because it proves the key real browsers get, Management API only when the
 * site can't be reached). The Management token itself (if used) is read in-process from
 * $SUPABASE_ACCESS_TOKEN or this repo's gitignored docs/Credentials.txt and is NEVER printed,
 * NEVER put on a command line, and NEVER logged — only whether a token was found at all.
 *
 * The probe address is the RESERVED, undeliverable `signin-captcha-guard@boatbuddy-test.local`.
 * It matches no real account (auth.users is empty on both projects; verified above) and the
 * `.local` TLD is non-routable, so even a wide-open /recover here cannot reach a real person.
 * NEVER point this file at a real address.
 *
 * STAGING IS DELIBERATELY LEFT OPEN TODAY, AND THAT IS REPORTED, NOT SILENTLY ASSUMED — but
 * unlike ReplyFlow, nothing in this repo depends on staging continuing to accept a tokenless
 * auth request (no e2e spec here performs a real Supabase Auth sign-in; see above), so this
 * guard does NOT fail the run if staging's state ever changes — closing staging early would be
 * a strict improvement, never a regression, for this project. It is reported informationally so
 * the "why not enforced" note stays honest instead of stale.
 *
 * Run: node scripts/signin-captcha.prod.test.mjs
 * Exit 0 = production (the only ENFORCED project) is CLOSED by one of the two valid mechanisms.
 * Exit 1 = production still accepts a tokenless /recover request (the hole is NOT closed), or
 *          no ENFORCED project could be probed at all.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CREDENTIALS_FILE = path.resolve(__dirname, '..', 'docs', 'Credentials.txt')

const PROJECTS = [
  {
    name: 'production',
    ref: 'xzythvxmuxmczuiophwp',
    site: 'https://boatbuddy.predivo.ch',
    anonEnv: 'SUPABASE_ANON_KEY',
    enforced: true,
  },
  {
    name: 'staging',
    ref: 'svpewgbwousyheohlrtt',
    // Sits behind HTTP basic auth (staging.boatbuddy.predivo.ch) — the bundle can't be scanned
    // anonymously, so this project relies on $STAGING_ANON_KEY or the Management API fallback.
    site: null,
    anonEnv: 'STAGING_ANON_KEY',
    enforced: false,
    whyNotEnforced:
      'no code in this repo performs a real Supabase Auth sign-in (see the header above — ' +
      'BoatBuddy has no client-side Auth call sites at all), so leaving staging open blocks ' +
      'nothing here and closing it is not sequenced by any technical dependency — only by ' +
      'which project Roger applies the fix to first.',
  },
]

const PROBE_EMAIL = 'signin-captcha-guard@boatbuddy-test.local'

// Pull the public anon/publishable key out of a deployed frontend bundle — the same value every
// browser gets. Two formats: the newer `sb_publishable_...` key (what BoatBuddy ships) and the
// legacy anon JWT (role "anon", disabled on this project but checked for completeness).
function findKeyInSource(body) {
  const pub = body.match(/sb_publishable_[A-Za-z0-9_-]+/)
  if (pub) return pub[0]
  const jwts = body.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []
  for (const jwt of jwts) {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
      if (payload.role === 'anon') return jwt
    } catch { /* not a JWT we can decode — keep looking */ }
  }
  return null
}

async function anonKeyFromSite(siteUrl) {
  const html = await (await fetch(siteUrl, { redirect: 'follow' })).text()
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => new URL(m[1], siteUrl).href)
  const seen = new Set(scripts)
  for (const js of scripts) {
    const body = await (await fetch(js)).text()
    const key = findKeyInSource(body)
    if (key) return key
    for (const name of new Set(body.match(/[A-Za-z0-9_]+-[A-Za-z0-9]+\.js/g) || [])) {
      const url = new URL(`assets/${name}`, siteUrl).href
      if (!seen.has(url)) { seen.add(url); scripts.push(url) }
    }
  }
  return null
}

/**
 * A Supabase management token, from the environment in CI and from this repo's gitignored
 * docs/Credentials.txt on a developer machine. The value is never printed, never put on a
 * command line and never written anywhere; a missing file is simply "no token".
 */
function managementToken() {
  const fromEnv = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()
  if (fromEnv) return fromEnv
  try {
    const text = readFileSync(CREDENTIALS_FILE, 'utf-8')
    return (text.match(/sbp_[A-Za-z0-9]{20,}/) || [])[0] || ''
  } catch {
    return ''
  }
}

/** The same PUBLIC publishable key, from the project itself rather than from the website. */
async function anonKeyFromManagementApi(ref) {
  const token = managementToken()
  if (!token) return null
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Management API api-keys -> HTTP ${res.status}`)
  const rows = await res.json()
  const pub = (Array.isArray(rows) ? rows : []).find((r) => r.type === 'publishable')
  return pub?.api_key?.trim() || null
}

async function anonKeyFor(project) {
  const fromEnv = process.env[project.anonEnv]?.trim()
  if (fromEnv) return { key: fromEnv, source: `$${project.anonEnv}` }
  if (project.site) {
    try {
      const key = await anonKeyFromSite(project.site)
      if (key) return { key, source: project.site }
    } catch (err) {
      console.error(`note - ${project.site} could not be read (${err.message}); trying the project itself.`)
    }
  }
  const key = await anonKeyFromManagementApi(project.ref)
  if (key) return { key, source: 'the Supabase Management API (publishable key)' }
  return null
}

/**
 * Classify a tokenless /recover response into one of: OPEN (the hole), CLOSED via captcha,
 * CLOSED via the email provider being off, RATE-LIMITED (inconclusive — Supabase's own
 * per-address limiter, not proof of either fix), or UNKNOWN (an unrecognised shape, always
 * surfaced rather than silently guessed at).
 */
function classifyRecoverResponse(status, text) {
  if (status === 401) return { state: 'key-refused' }
  if (status === 429) {
    return { state: 'inconclusive', detail: 'rate-limited by Supabase\'s own per-address limiter (not proof of either fix)' }
  }
  if (status === 400 && /captcha/i.test(text)) {
    return { state: 'closed', how: 'captcha', detail: 'tokenless /recover refused for a captcha reason' }
  }
  if ((status === 400 || status === 422) && /email_provider_disabled|email provider is disabled|email logins? (is|are) disabled/i.test(text)) {
    return { state: 'closed', how: 'email-provider-off', detail: 'tokenless /recover refused because the email auth provider is disabled' }
  }
  if (status === 200) {
    return { state: 'open', detail: 'tokenless /recover accepted (HTTP 200) — the exact hole this guard exists for' }
  }
  return { state: 'unknown', detail: `unexpected HTTP ${status}: ${text.slice(0, 300)}` }
}

async function tokenlessRecover(project, anon) {
  const res = await fetch(`https://${project.ref}.supabase.co/auth/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
    body: JSON.stringify({ email: PROBE_EMAIL }),
  })
  const text = await res.text()
  return { status: res.status, text, ...classifyRecoverResponse(res.status, text) }
}

let failures = 0
let covered = 0
let coveredEnforced = 0
for (const p of PROJECTS) {
  let found
  try {
    found = await anonKeyFor(p)
  } catch (err) {
    console.error(`SKIP - ${p.name} (${p.ref}): could not fetch anon key: ${err.message}`)
    continue
  }
  if (!found) {
    console.error(
      `SKIP - ${p.name} (${p.ref}): no anon key (set ${p.anonEnv}, or SUPABASE_ACCESS_TOKEN / ` +
        "docs/Credentials.txt to read the project's own publishable key). NOT counted as passing."
    )
    continue
  }
  const { key: anon, source } = found
  covered++
  if (p.enforced) coveredEnforced++
  console.log(`     ${p.name}: probing with the public key from ${source}`)
  try {
    const r = await tokenlessRecover(p, anon)
    assert.ok(
      r.state !== 'key-refused',
      `${p.name}: the key was REFUSED (401) — this run tested nothing. Body: ${r.text.slice(0, 300)}`
    )
    assert.ok(
      r.state !== 'unknown',
      `${p.name}: could not classify the response — ${r.detail}`
    )
    if (p.enforced) {
      assert.ok(
        r.state === 'closed',
        `${p.name}: tokenless /recover must be refused (captcha or email-provider-off); ` +
          `found state=${r.state} (${r.detail})`
      )
      console.log(`ok - ${p.name} (${p.ref}): CLOSED via ${r.how} — ${r.detail}`)
    } else {
      console.log(`note - ${p.name} (${p.ref}): state=${r.state} (${r.detail}). ${p.whyNotEnforced}`)
    }
  } catch (err) {
    failures++
    console.error(`FAIL - ${p.name} (${p.ref}): ${err.message}`)
  }
}

if (covered === 0) {
  console.error('\nNo project could be probed (no anon key obtained). This guard proved nothing.')
  process.exit(1)
}
if (coveredEnforced === 0) {
  console.error('\nNo ENFORCED project could be probed. The only projects reached were ones deliberately left')
  console.error('open, so nothing was proved about the vulnerability this guard exists for.')
  process.exit(1)
}
if (failures > 0) {
  console.error(`\n${failures} project(s) are in the wrong state — the sign-in-email hole is NOT fully closed.`)
  process.exit(1)
}
console.log(
  `\nAll ${coveredEnforced} enforced project(s) are closed (captcha or email-provider-off). ` +
    'The unauthenticated sign-in-email hole is closed where it must be.'
)
process.exit(0)
