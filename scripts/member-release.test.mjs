import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gateOf, loadGates } from './lib/release-gate.mjs'
const read = file => readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
const job = (workflow, name) => read(workflow).split(`\n  ${name}:`)[1].split(/\n  [a-z-]+:\n/)[0]
const steps = source => source.split('\n      - ').slice(1)

test('shared hash is provided only to release settings, never to a browser build', () => {
  const workflow = read('.github/workflows/deploy.yml')
  assert.equal((workflow.match(/MEMBER_PASSWORD_HASH: \$\{\{ secrets.VITE_GATE_PASSWORD_HASH \}\}/g) ?? []).length, 2)
  assert.doesNotMatch(workflow, /\n\s+VITE_GATE_PASSWORD_HASH:/)
  for (const file of ['src/components/shared/PasswordGate.tsx','src/lib/supabase.ts','src/lib/extractInvoice.ts']) {
    assert.doesNotMatch(read(file), /VITE_GATE_PASSWORD_HASH|MEMBER_PASSWORD_HASH|MEMBER_GATE_PASSWORD|SERVICE_ROLE|SB_SECRET/)
  }
  assert.match(read('src/lib/supabase.ts'), /storage: window.sessionStorage/)
  assert.match(read('src/lib/extractInvoice.ts'), /Bearer \$\{session.access_token\}/)
})

// RELEASE 1 of 2, in both environments: additive migrations, then the edge functions, then a
// smoke (wrong password 401, real password 200 and signed out), then the new front end, and
// only THEN the member-only extract-expense. Nothing before the upload removes what the old
// front end uses, so a failed later step leaves it working.
test('both releases: additive migrations, then functions, then the smoke, then the front end, then extract-expense', () => {
  for (const [name, env, upload, site] of [
    ['deploy-staging', 'staging', 'Deploy staging via FTP', 'https://staging.boatbuddy.predivo.ch'],
    ['deploy', 'production', 'Deploy via FTP', 'https://boatbuddy.predivo.ch'],
  ]) {
    const source = job('.github/workflows/deploy.yml', name)
    const at = text => { const i = source.indexOf(text); assert.ok(i >= 0, `${name}: missing ${text}`); return i }
    // Settings (member identity + hash secret) before the functions that need them.
    assert.ok(at(`configure-auth.mjs --environment ${env} --apply`) < at(`Deploy edge functions to ${env}`))
    const order = [
      `Apply DB migrations to ${env}`,
      `Deploy edge functions to ${env}`,
      `node scripts/member-gate-smoke.mjs --environment ${env}`,
      upload,
      `Deploy extract-expense (member-only) to ${env} after the front end`,
      `supabase functions deploy extract-expense --project-ref`,
    ].map(at)
    assert.deepEqual([...order].sort((a, b) => a - b), order, `${name}: release order`)
    // The early deploy excludes extract-expense, so it can never ship before the upload.
    const early = steps(source).find(step => step.startsWith(`name: Deploy edge functions to ${env}`))
    assert.match(early, /-not -name '_\*' -not -name extract-expense -printf/)
    // The smoke gets the real password from the secret.
    assert.match(steps(source).find(step => step.includes(`member-gate-smoke.mjs --environment ${env}`)), /MEMBER_GATE_PASSWORD: \$\{\{ secrets.MEMBER_GATE_PASSWORD \}\}/)
    // The release gate reads THIS environment's live site, never the other one.
    assert.match(source, new RegExp(`apply-migrations\\.mjs --project-ref \\w+ --site-url ${site.replaceAll('.', '\\.')}\\n`))
  }
  const staging = job('.github/workflows/deploy.yml', 'deploy-staging')
  const migrate = steps(staging).find(step => step.startsWith('name: Apply DB migrations to staging'))
  assert.match(migrate, /SITE_AUTH_USER: \$\{\{ secrets.STAGING_HTPASSWD_USER \}\}/)
  const production = steps(job('.github/workflows/deploy.yml', 'deploy'))
  assert.match(production.find(step => step.includes('member-gate-smoke.mjs --environment production')), /SUPABASE_PUBLIC_KEY: \$\{\{ secrets.VITE_SUPABASE_ANON_KEY \}\}/)
})

// RELEASE 2 of 2: the anonymous revokes live ONLY in the gated migration, and its gate is off.
test('the anonymous revokes are a separate, gated, later migration; release 1 is additive', () => {
  const additive = read('supabase/migrations/034_member_access_alongside_anon.sql')
  const revoke = read('supabase/migrations/035_revoke_anonymous_access.sql')
  assert.equal(gateOf(additive), null)
  assert.equal(gateOf(revoke), 'member-frontend-live')
  assert.equal(loadGates()['member-frontend-live'], false, 'release 2 is switched on by its own later PR')
  // Release 1 never takes anything from anon or PUBLIC and never drops an anon policy.
  assert.doesNotMatch(additive, /revoke[^;]*\bon (?:function )?public\.[^;]*\bfrom\b[^;]*\b(?:anon|public)\b/i)
  assert.doesNotMatch(additive, /drop policy[^;]*"Anon|drop policy if exists anon_all/i)
  assert.doesNotMatch(additive, /raise exception/)
  assert.doesNotMatch(additive, /set status = 'expired'/)
  // Release 2 carries every removal and the guard.
  for (const pattern of [
    /revoke all on public\.%I from public, anon/,
    /revoke all \(%I\) on public\.%I from public, anon/,
    /drop policy if exists anon_all on public\.tanken/,
    /delete_changelog_cascade\(uuid\)\s+from public, anon;/,
    /set status = 'expired' where status = 'pending'/,
    /drop policy if exists "Anon can read invoices" on storage\.objects/,
    /raise exception '035: anonymous table rights remain'/,
    /raise exception '035: anonymous policies remain/,
  ]) assert.match(revoke, pattern)
  // Release 2 never re-grants: it only removes.
  assert.doesNotMatch(revoke.replace(/--.*$/gm, ''), /\bgrant\b/i)
  // And it is release 2 in the local PostgreSQL checks too.
  assert.match(read('scripts/test-database-security.mjs'), /release-1-compatibility-checks\.sql/)
  assert.match(read('docs/RUNBOOK-member-gate.md'), /release-gates\.json/)
})

test('staging browser tests use member sessions and can never target production', () => {
  for (const file of ['e2e/critical-path.spec.ts','e2e/staging/authenticated.spec.ts','e2e/staging/gate-a.config.ts','e2e/staging/v11-gates.spec.ts']) {
    assert.doesNotMatch(read(file), /boatbuddy-unlocked/)
    assert.match(read(file), /signInMember/)
  }
  assert.doesNotMatch(read('playwright.config.ts') + read('e2e/critical-path.spec.ts'), /xzythvxmuxmczuiophwp|https:\/\/boatbuddy\.predivo/)
  assert.match(read('scripts/lib/staging-member.mjs'), /env.STAGING_SUPABASE_URL !== STAGING_API/)
})

test('the real shared password is exercised by the staging E2E and the two release smokes only, never printed', () => {
  const spec = read('e2e/staging/member-password.spec.ts')
  assert.match(spec, /exchangeSharedPassword\(PASSWORD\)/)
  assert.match(spec, /functions\/v1\/member-session/)
  assert.doesNotMatch(spec, /\.fill\(PASSWORD|\.type\(PASSWORD|console\.|signInMember|stagingMemberSession/)
  assert.match(spec, /test\.use\(\{ trace: 'off', video: 'off' \}\)/)
  const workflows = ['deploy.yml', 'test.yml', 'staging-gates.yml'].map(f => read(`.github/workflows/${f}`)).join('\n')
  // gate-e2e, and the release smoke of each environment (staging, production).
  assert.equal((workflows.match(/MEMBER_GATE_PASSWORD:/g) ?? []).length, 3)
  const smoke = read('scripts/member-gate-smoke.mjs')
  assert.match(smoke, /password: process\.env\.MEMBER_GATE_PASSWORD/)
  assert.match(smoke, /\/auth\/v1\/logout\?scope=local/)
  // It prints one fixed success line and the error message (proven secret-free in its own suite).
  assert.deepEqual(smoke.match(/console\.\w+\(/g), ['console.log(', 'console.error('])
  assert.match(smoke, /console\.log\('[^'$`]*'\)/)
  assert.match(smoke, /console\.error\(`::error::\$\{error\.message\}`\)/)
  assert.match(steps(job('.github/workflows/deploy.yml', 'gate-e2e')).find(s => s.startsWith('name: Run staging E2E tests')), /MEMBER_GATE_PASSWORD: \$\{\{ secrets.MEMBER_GATE_PASSWORD \}\}/)
})

test('the org-wide Management API token never reaches a test process', () => {
  const runsTests = /\bnpm (?:test|run test)|npx (?:vitest|playwright)|seed-gate-a-fixtures|node --test/
  for (const file of ['deploy.yml', 'test.yml', 'staging-gates.yml']) {
    for (const step of read(`.github/workflows/${file}`).split(/\n\s+- (?=name:|run:|uses:)/)) {
      if (runsTests.test(step)) assert.doesNotMatch(step, /SUPABASE_ACCESS_TOKEN|BB_MGMT_TOKEN: \$\{\{ secrets.SUPABASE/, `${file}: ${step.split('\n')[0]}`)
    }
  }
  assert.doesNotMatch(read('scripts/lib/staging-member.mjs').replace(/^\/\/.*$/gm, ''), /SUPABASE_ACCESS_TOKEN|BB_MGMT_TOKEN|api\.supabase\.com/)
})

test('public phone page has no direct table or Storage access', () => {
  assert.doesNotMatch(read('src/pages/PhoneUploadPage.tsx'), /\.from\(|\.storage\b/)
  assert.match(read('src/pages/PhoneUploadPage.tsx'), /functions.invoke\('phone-upload'/)
  assert.match(read('supabase/functions/phone-upload/index.ts'), /upsert: false/)
  assert.match(read('supabase/migrations/034_member_access_alongside_anon.sql'), /grant insert \(token,status\) on public.phone_upload_sessions to authenticated/)
})
