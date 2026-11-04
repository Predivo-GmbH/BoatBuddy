#!/usr/bin/env node
// Settings as code. Default mode is offline. Only the matching Deploy job may apply.
// Management API contracts: docs/DECISIONS.md (Wave 3).
import { pathToFileURL } from 'node:url'
import { provisionMember } from './lib/provision-member.mjs'

export const TARGETS = Object.freeze({
  staging: Object.freeze({ ref: 'svpewgbwousyheohlrtt', origin: 'https://staging.boatbuddy.predivo.ch', job: 'deploy-staging', event: 'push' }),
  production: Object.freeze({ ref: 'xzythvxmuxmczuiophwp', origin: 'https://boatbuddy.predivo.ch', job: 'deploy', event: 'workflow_dispatch' }),
})

export function settingsPlan(environment) {
  if (!Object.hasOwn(TARGETS, environment)) throw new Error('Choose --environment staging or production')
  const target = TARGETS[environment]
  return {
    ...target,
    auth: {
      // Only the server's admin-token exchange signs the shared member in.
      // Public mail/password/signup endpoints remain closed.
      external_email_enabled: false,
      external_phone_enabled: false,
      external_anonymous_users_enabled: false,
      disable_signup: true,
      mailer_autoconfirm: false,
      mailer_secure_email_change_enabled: true,
      mailer_otp_exp: 600,
      mailer_otp_length: 6,
      mailer_templates_magic_link_content: '<h2>BoatBuddy</h2><p>Dein Anmeldecode: <strong>{{ .Token }}</strong></p><p>10 Minuten gültig. Gib den Code nur selbst in BoatBuddy ein.</p>',
      rate_limit_email_sent: 30,
      site_url: target.origin,
      uri_allow_list: `${target.origin}/`,
      refresh_token_rotation_enabled: true,
      jwt_exp: 900,
      security_refresh_token_reuse_interval: 10,
      // HOURS, not seconds (SR-AUTH-06): the Management API reads these two in hours.
      // Seconds here once overflowed Auth's maximum duration and crash-looped sign-in.
      sessions_timebox: 30 * 24, // 720 h = 30 days
      sessions_inactivity_timeout: 7 * 24, // 168 h = 7 days
      sessions_single_per_user: false,
      password_min_length: 15,
      password_required_characters: '',
      password_hibp_enabled: true,
      security_update_password_require_reauthentication: true,
    },
    postgrest: { db_schema: 'public', db_extra_search_path: 'public, extensions' },
  }
}

export function assertReleaseContext(environment, env) {
  const plan = settingsPlan(environment)
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_WORKFLOW !== 'Deploy' ||
      env.GITHUB_REPOSITORY !== 'Predivo-GmbH/BoatBuddy' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_JOB !== plan.job || env.GITHUB_EVENT_NAME !== plan.event ||
      (environment === 'production' && env.RELEASE_CONFIRM !== 'deploy')) {
    throw new Error('Settings apply is restricted to the matching staging/production Deploy job on main')
  }
  if (!env.SUPABASE_ACCESS_TOKEN?.trim()) throw new Error('SUPABASE_ACCESS_TOKEN is required')
  return plan
}

// Supabase refuses the WHOLE auth PATCH when it holds one setting the project cannot have:
// HTTP 402 for a Pro-plan feature on a free organization, HTTP 401 for the email rate limit
// without custom SMTP (staging run 41908490580, 2026-11-04). The security standard asks for
// these "where the plan offers them" (SR-AUTH-06) and "where passwords exist" (SR-AUTH-09).
// So each is applied and read back whenever the project offers it, and named in a release
// warning whenever it does not. Nothing is lowered and no plan is bought.
export const GATED_AUTH = Object.freeze({
  password_hibp_enabled: 'pro-plan',
  sessions_timebox: 'pro-plan',
  sessions_inactivity_timeout: 'pro-plan',
  rate_limit_email_sent: 'custom-smtp',
})

// SR-AUTH-06: the Management API takes these in HOURS. Refuse anything outside 1..8760
// (one hour to one year) before a single request is sent, so a value written in seconds
// (2,592,000) can never reach Auth again.
export const SESSION_HOUR_SETTINGS = Object.freeze(['sessions_timebox', 'sessions_inactivity_timeout'])
export function assertSessionHours(auth) {
  for (const name of SESSION_HOUR_SETTINGS) {
    if (!Object.hasOwn(auth, name)) continue
    const value = auth[name]
    if (!Number.isInteger(value) || value < 1 || value > 8760) {
      throw new Error(`Auth setting ${name} must be whole HOURS between 1 and 8760; refusing to send ${value}`)
    }
  }
  return auth
}

// Only an explicit "free" tier skips the Pro settings. An unreadable or unknown tier sends
// them, so Supabase itself decides and a refusal still stops the release.
export function authToApply(auth, { tier, customSmtp }) {
  const apply = {}
  const notOffered = []
  for (const [name, value] of Object.entries(auth)) {
    const gate = GATED_AUTH[name]
    if ((gate === 'pro-plan' && tier === 'free') || (gate === 'custom-smtp' && customSmtp !== true)) notOffered.push(name)
    else apply[name] = value
  }
  return { apply, notOffered }
}

export async function applySettings(environment, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const plan = assertReleaseContext(environment, env)
  assertSessionHours(plan.auth)
  if (!/^[a-f0-9]{64}$/i.test(env.MEMBER_PASSWORD_HASH ?? '')) {
    throw new Error('MEMBER_PASSWORD_HASH is required (existing shared-password SHA-256 secret)')
  }
  const api = 'https://api.supabase.com/v1'
  const base = `${api}/projects/${plan.ref}`
  const request = (method, endpoint, body) => call(method, `${base}${endpoint}`, endpoint, body)
  async function call(method, url, endpoint, body) {
    let response
    try {
      response = await fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      })
    } catch {
      // Never echo response bodies, fetch errors or configuration: they can contain credentials.
      throw new Error(`Settings ${method} ${endpoint}: transport failure`)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Settings ${method} ${endpoint}: HTTP ${response.status}; no security downgrade was attempted`)
    }
    try { return await response.json() } catch { throw new Error(`Settings ${method} ${endpoint}: invalid JSON`) }
  }

  // SSL changes can restart Postgres. Do not trigger an unnecessary restart on every release.
  const ssl = await request('GET', '/ssl-enforcement')
  if (ssl.currentConfig?.database !== true) {
    const applied = await request('PUT', '/ssl-enforcement', { requestedConfig: { database: true } })
    if (applied.appliedSuccessfully !== true || applied.currentConfig?.database !== true) {
      throw new Error('SSL enforcement did not apply; release stopped')
    }
  }
  const project = await call('GET', base, '/project')
  if (typeof project.organization_id !== 'string' || !project.organization_id) {
    throw new Error('Settings GET /project: no organization; release stopped')
  }
  const organization = await call('GET', `${api}/organizations/${encodeURIComponent(project.organization_id)}`, '/organization')
  const current = await request('GET', '/config/auth')
  const customSmtp = typeof current.smtp_host === 'string' && current.smtp_host.trim() !== ''
  const { apply, notOffered } = authToApply(plan.auth, { tier: organization.plan, customSmtp })
  for (const name of notOffered) {
    const why = GATED_AUTH[name] === 'pro-plan'
      ? `Supabase offers it on Pro plans and up; this organization's plan is "${organization.plan}"`
      : 'Supabase allows it only with custom SMTP, which this project does not have'
    log(`::warning::${environment}: auth setting ${name} not applied - ${why}`)
  }
  await request('PATCH', '/config/auth', assertSessionHours(apply))
  const auth = await request('GET', '/config/auth')
  for (const [name, expected] of Object.entries(apply)) {
    if (auth[name] !== expected) throw new Error(`Auth setting not verified: ${name}`)
  }
  await request('PATCH', '/postgrest', plan.postgrest)
  const rest = await request('GET', '/postgrest')
  for (const [name, expected] of Object.entries(plan.postgrest)) {
    if (rest[name] !== expected) throw new Error(`Data API setting not verified: ${name}`)
  }
  await provisionMember({ ref: plan.ref, passwordHash: env.MEMBER_PASSWORD_HASH, request, fetchImpl })
  return { environment, verified: true, notOffered }
}

export async function main(args = process.argv.slice(2)) {
  const apply = args.includes('--apply')
  const index = args.indexOf('--environment')
  const environment = index >= 0 ? args[index + 1] : undefined
  if (args.length !== (apply ? 3 : 2) || args.some((arg, i) => i !== index + 1 && !['--environment', '--apply'].includes(arg))) {
    throw new Error('Usage: configure-auth.mjs --environment staging|production [--apply]')
  }
  const plan = settingsPlan(environment)
  assertSessionHours(plan.auth)
  if (apply) {
    await applySettings(environment)
    console.log(`Settings verified for ${environment}`)
  } else {
    console.log(`Offline ${environment} plan: ${Object.keys(plan.auth).length} auth settings, Data API schema and SSL enforcement; no requests made`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
