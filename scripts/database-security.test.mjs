import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const read = name => readFileSync(name, 'utf8').replaceAll('\r\n', '\n')
const sql = read('supabase/migrations/033_security_rulebook_database_rights.sql')
const deploy = read('.github/workflows/deploy.yml')
function job(name) {
  const start = deploy.indexOf(`\n  ${name}:\n`)
  assert.ok(start >= 0)
  return deploy.slice(start + 1).split(/\n  [\w-]+:\n/)[0]
}

test('settings belong only to their matching release jobs and reuse the migration token', () => {
  assert.equal((deploy.match(/node scripts\/configure-auth\.mjs/g) ?? []).length, 2)
  const staging = job('deploy-staging')
  const production = job('deploy')
  assert.match(staging, /if: github.event_name == 'push'/)
  assert.match(production, /github.event_name == 'workflow_dispatch'/)
  assert.ok(/inputs.confirm == 'deploy'/.test(production), 'production requires explicit promotion input')
  assert.match(production, /gate-security/)
  for (const [environment, source] of [['staging', staging], ['production', production]]) {
    assert.match(source, new RegExp(`SUPABASE_ACCESS_TOKEN: \\$\\{\\{ secrets.SUPABASE_ACCESS_TOKEN \\}\\}\\n(?:[^\\n]+\\n)?        run: node scripts/configure-auth\\.mjs --environment ${environment} --apply`))
    assert.doesNotMatch(source, new RegExp(`configure-auth\\.mjs --environment ${environment === 'staging' ? 'production' : 'staging'}`))
  }
  assert.ok(staging.indexOf('Apply and verify Supabase security settings') < staging.indexOf('- name: Unit tests'))
  assert.ok(production.indexOf('Apply and verify Supabase security settings') < production.indexOf('- name: Deploy via FTP'))
})

test('all frontend database calls are covered by the reviewed SQL allow-list', () => {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(file) : /\.[jt]sx?$/.test(file) && !file.includes('__tests__') ? [file] : []
  })
  const tables = new Set()
  const functions = new Set()
  for (const file of walk('src')) {
    for (const match of read(file).matchAll(/\.from\(['"]([a-z_]+)['"]\)/g)) tables.add(match[1])
    for (const match of read(file).matchAll(/\.rpc\(['"]([a-z_]+)['"]/g)) functions.add(match[1])
  }
  assert.equal(tables.size, 15) // 14 public tables plus the Storage bucket.
  for (const table of tables) {
    if (table === 'dokumente') continue // storage.from(), not a public table
    assert.match(sql, new RegExp(`grant select on[\\s\\S]*?public\\.${table}\\b[\\s\\S]*?to anon;`))
  }
  assert.deepEqual([...functions].sort(), ['adjust_gesamtstunden','create_nutzungslog_atomic','delete_changelog_cascade','delete_nutzungslog_atomic'])
  for (const fn of functions) assert.match(sql, new RegExp(`alter function public\\.${fn}\\([^;]+security invoker;`))
  assert.match(sql, /grant execute on function public\.bump_extract_rate\(text,timestamptz\) to service_role;/)
})

test('migration is transactional, historical numbers are unique, and lint baseline stays closed', () => {
  assert.match(sql, /\bbegin;/)
  assert.match(sql, /commit;\s*$/)
  const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'))
  const versions = files.map(f => f.split('_')[0])
  assert.equal(new Set(versions).size, versions.length)
  assert.ok(!JSON.parse(read('migration-grants-baseline.json')).files.some(f => f.startsWith('033_')))
})

test('GraphQL health callers use REST; phone uploads use polling without public broadcasts', () => {
  for (const file of ['.github/workflows/keep-alive.yml','e2e/critical-path.spec.ts','e2e/staging/public.spec.ts']) {
    assert.doesNotMatch(read(file), /graphql\/v1/)
    assert.match(read(file), /rest\/v1\//)
  }
  const phone = read('src/hooks/usePhoneUpload.ts')
  assert.doesNotMatch(phone, /\.channel\(|postgres_changes/)
  assert.match(phone, /startPolling\(data\.id, token\)/)
  assert.match(phone, /setInterval[\s\S]*?2000\)/)
  assert.match(sql, /alter publication supabase_realtime drop table public.phone_upload_sessions/)
})

test('real SQL regression checks run in CI with a network-disabled pinned database', () => {
  assert.match(read('.github/workflows/test.yml'), /run: node scripts\/test-database-security.mjs/)
  const runner = read('scripts/test-database-security.mjs')
  assert.match(runner, /postgres@sha256:[a-f0-9]{64}/)
  assert.match(runner, /'--pull=never'/)
  assert.match(runner, /'--network', 'none'/)
  assert.doesNotMatch(runner, /SUPABASE_ACCESS_TOKEN|process\.env|--publish|--network', 'host'/)
})
