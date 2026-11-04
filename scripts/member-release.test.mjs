import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = file => readFileSync(file, 'utf8').replaceAll('\r\n', '\n')

test('shared hash is provided only to release settings, never to a browser build', () => {
  const workflow = read('.github/workflows/deploy.yml')
  assert.equal((workflow.match(/MEMBER_PASSWORD_HASH: \$\{\{ secrets.VITE_GATE_PASSWORD_HASH \}\}/g) ?? []).length, 2)
  assert.doesNotMatch(workflow, /\n\s+VITE_GATE_PASSWORD_HASH:/)
  for (const file of ['src/components/shared/PasswordGate.tsx','src/lib/supabase.ts','src/lib/extractInvoice.ts']) {
    assert.doesNotMatch(read(file), /VITE_GATE_PASSWORD_HASH|MEMBER_PASSWORD_HASH|SERVICE_ROLE|SB_SECRET/)
  }
  assert.match(read('src/lib/supabase.ts'), /storage: window.sessionStorage/)
  assert.match(read('src/lib/extractInvoice.ts'), /Bearer \$\{session.access_token\}/)
})
test('both releases provision settings and ship member endpoints before the frontend', () => {
  const workflow = read('.github/workflows/deploy.yml')
  for (const [job, env, upload] of [['deploy-staging','staging','Deploy staging via FTP'],['deploy','production','Deploy via FTP']]) {
    const source = workflow.split(`\n  ${job}:`)[1].split(/\n  [a-z-]+:\n/)[0]
    assert.ok(source.indexOf(`configure-auth.mjs --environment ${env} --apply`) < source.indexOf(`Deploy edge functions to ${env}`))
    assert.ok(source.indexOf(`Apply DB migrations to ${env}`) < source.indexOf(upload))
    assert.ok(source.indexOf(`Deploy edge functions to ${env}`) < source.indexOf(upload))
  }
})
test('staging browser tests use member sessions and can never target production', () => {
  for (const file of ['e2e/critical-path.spec.ts','e2e/staging/authenticated.spec.ts','e2e/staging/gate-a.config.ts','e2e/staging/v11-gates.spec.ts']) {
    assert.doesNotMatch(read(file), /boatbuddy-unlocked/)
    assert.match(read(file), /signInMember/)
  }
  assert.doesNotMatch(read('playwright.config.ts') + read('e2e/critical-path.spec.ts'), /xzythvxmuxmczuiophwp|https:\/\/boatbuddy\.predivo/)
  assert.match(read('scripts/lib/staging-member.mjs'), /env.STAGING_SUPABASE_URL !== STAGING_API/)
})
test('public phone page has no direct table or Storage access', () => {
  assert.doesNotMatch(read('src/pages/PhoneUploadPage.tsx'), /\.from\(|\.storage\b/)
  assert.match(read('src/pages/PhoneUploadPage.tsx'), /functions.invoke\('phone-upload'/)
  assert.match(read('supabase/functions/phone-upload/index.ts'), /upsert: false/)
  assert.match(read('supabase/migrations/034_server_checked_member_gate.sql'), /grant insert \(token,status\) on public.phone_upload_sessions to authenticated/)
})
