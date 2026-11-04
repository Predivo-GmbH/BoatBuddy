#!/usr/bin/env node
// Settings as code. Default mode is offline. Only the matching Deploy job may apply.
// Management API contracts: docs/DECISIONS.md (Wave 3).
import { pathToFileURL } from 'node:url'

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
      // There is no Supabase sign-in in BoatBuddy. Preserve the closed mail endpoint.
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
      security_refresh_token_reuse_interval: 10,
      sessions_timebox: 30 * 24 * 60 * 60,
      sessions_inactivity_timeout: 7 * 24 * 60 * 60,
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

export async function applySettings(environment, { env = process.env, fetchImpl = fetch } = {}) {
  const plan = assertReleaseContext(environment, env)
  const base = `https://api.supabase.com/v1/projects/${plan.ref}`
  async function request(method, endpoint, body) {
    let response
    try {
      response = await fetchImpl(`${base}${endpoint}`, {
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
  await request('PATCH', '/config/auth', plan.auth)
  const auth = await request('GET', '/config/auth')
  for (const [name, expected] of Object.entries(plan.auth)) {
    if (auth[name] !== expected) throw new Error(`Auth setting not verified: ${name}`)
  }
  await request('PATCH', '/postgrest', plan.postgrest)
  const rest = await request('GET', '/postgrest')
  for (const [name, expected] of Object.entries(plan.postgrest)) {
    if (rest[name] !== expected) throw new Error(`Data API setting not verified: ${name}`)
  }
  return { environment, verified: true }
}

export async function main(args = process.argv.slice(2)) {
  const apply = args.includes('--apply')
  const index = args.indexOf('--environment')
  const environment = index >= 0 ? args[index + 1] : undefined
  if (args.length !== (apply ? 3 : 2) || args.some((arg, i) => i !== index + 1 && !['--environment', '--apply'].includes(arg))) {
    throw new Error('Usage: configure-auth.mjs --environment staging|production [--apply]')
  }
  const plan = settingsPlan(environment)
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
