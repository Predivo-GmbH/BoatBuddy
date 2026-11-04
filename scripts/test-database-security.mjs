#!/usr/bin/env node
// Executes real PostgreSQL without networking, published ports, credentials or a
// persistent volume. Requires this pinned Supabase image already in Docker's cache.
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

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
  const migrations = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
  const source = [
    ...migrations.map(file => readFileSync(`supabase/migrations/${file}`, 'utf8')),
    readFileSync('scripts/fixtures/database-security-checks.sql', 'utf8'),
    readFileSync('scripts/fixtures/member-security-checks.sql', 'utf8'),
  ].join('\n')
  // One psql session also makes temp-fixture lifetimes unambiguous.
  const output = sql(source)
  const receipts = output.split('\n').filter(line => /^\d+ PostgreSQL security\/compatibility assertions passed$/.test(line))
  if (receipts.length !== 1) throw new Error('Local database checks produced no unique completion receipt')
  console.log(`Applied ${migrations.length} migrations locally`)
  console.log(receipts[0])
} finally {
  if (created) docker(['rm', '--force', '--volumes', name])
}
