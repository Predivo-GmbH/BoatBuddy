#!/usr/bin/env node
// Executes real PostgreSQL without networking, published ports, credentials or a
// persistent volume. Requires this pinned Supabase image already in Docker's cache.
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { gateOf } from './lib/release-gate.mjs'

const image = 'public.ecr.aws/supabase/postgres@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453'
const name = `boatbuddy-security-${randomUUID()}`
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120_000 })
  if (result.error || result.status !== 0) throw new Error(`Local Docker command failed: ${result.stderr || result.error?.message}`)
  return result.stdout
}
function sql(source, user = 'postgres') {
  return docker(['exec', '-i', name, 'psql', '-U', user, '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], source)
}

docker(['image', 'inspect', image, '--format', '{{.Id}}'])
let created = false
try {
  docker(['run', '--pull=never', '--detach', '--network', 'none', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image])
  created = true
  // Bounded readiness wait in our own container. It never touches a host database.
  // Bootstrap uses a temporary socket-only server; wait for final TCP readiness.
  docker(['exec', name, 'bash', '-c', 'for i in {1..45}; do pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'])
  // The image's own `postgres` database, not a fresh createdb: only it carries Supabase's
  // platform setup (graphql_public, supabase_admin's default privileges, the realtime
  // publication). A fresh database has none of it, which is how 033 passed here and was
  // refused on hosted staging (run 41901180121, 2026-11-04).
  // The platform stand-ins (Storage tables, extensions) are created by the platform's own
  // superuser, as on hosted Supabase; the migrations then run as postgres, the CI migrator.
  sql(readFileSync('scripts/fixtures/database-security-bootstrap.sql', 'utf8'), 'supabase_admin')
  // TWO RELEASES, TWO PHASES (2026-11-04). Release 1 is every migration before the first
  // one gated with `-- release-gate:` (see scripts/lib/release-gate.mjs); release 2 starts
  // there. Phase 1 proves the OLD anonymous front end still works next to members; the
  // final phase proves release 2 removes it. Same order apply-migrations.mjs uses.
  const migrations = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
  const read = file => readFileSync(`supabase/migrations/${file}`, 'utf8')
  const firstGated = migrations.findIndex(file => gateOf(read(file)))
  if (firstGated < 1) throw new Error('Expected release-1 migrations followed by a gated release-2 migration')
  const release1 = migrations.slice(0, firstGated)
  const release2 = migrations.slice(firstGated)
  const phase1 = sql([
    ...release1.map(read),
    readFileSync('scripts/fixtures/release-1-compatibility-checks.sql', 'utf8'),
  ].join('\n'))
  const phase1Receipts = phase1.split('\n').filter(line => /^\d+ release-1 compatibility assertions passed$/.test(line))
  if (phase1Receipts.length !== 1) throw new Error('Release-1 checks produced no unique completion receipt')
  // One psql session also makes temp-fixture lifetimes unambiguous.
  const output = sql([
    ...release2.map(read),
    readFileSync('scripts/fixtures/database-security-checks.sql', 'utf8'),
    readFileSync('scripts/fixtures/member-security-checks.sql', 'utf8'),
  ].join('\n'))
  const receipts = output.split('\n').filter(line => /^\d+ PostgreSQL security\/compatibility assertions passed$/.test(line))
  if (receipts.length !== 1) throw new Error('Local database checks produced no unique completion receipt')
  console.log(`Release 1: applied ${release1.length} migrations locally; ${phase1Receipts[0]}`)
  console.log(`Release 2: applied ${release2.join(', ')}`)
  console.log(receipts[0])
} finally {
  if (created) docker(['rm', '--force', '--volumes', name])
}
