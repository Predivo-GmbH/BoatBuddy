#!/usr/bin/env node
/**
 * Apply pending SQL migrations to a Supabase project, from CI.
 *
 * WHY THIS EXISTS (2026-08-21). The deploy workflow shipped the site and the edge functions but
 * never the database, so every schema change needed a separate manual action - and manual steps
 * get skipped. Proof: migration 055 was recorded in prod's ledger on 2026-08-01, yet prod's
 * `handle_new_user` was still the pre-055 definition three weeks later. The website said one
 * thing and the database did another, invisibly, because nothing checked.
 *
 * Contract:
 *   node scripts/apply-migrations.mjs --project-ref <ref> [--dry-run]
 *   env: SUPABASE_ACCESS_TOKEN  (Management API PAT)
 *
 * Applies every `supabase/migrations/NNN_name.sql` whose version is not yet in
 * `supabase_migrations.schema_migrations`, in filename order, one statement batch per file,
 * recording the version+name on success. A failure stops the run and exits non-zero, so a bad
 * migration fails the deploy instead of half-applying and being forgotten.
 *
 * DUPLICATE-NUMBER GUARD: two files sharing a version number is a hard error, checked before
 * anything is applied. That happened for real - `056_retention_offer.sql` and
 * `056_trial_draft_only_no_clock.sql` coexisted - and because the ledger keys on the NUMBER,
 * the second file would have been treated as already applied and silently skipped forever.
 */

import fs from 'node:fs'
import path from 'node:path'

const API = 'https://api.supabase.com/v1/projects'
const MIGRATIONS_DIR = path.resolve('supabase/migrations')

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}

const projectRef = arg('--project-ref')
const dryRun = process.argv.includes('--dry-run')
const token = process.env.SUPABASE_ACCESS_TOKEN

if (!projectRef) {
  console.error('::error::apply-migrations: --project-ref is required')
  process.exit(1)
}
if (!token) {
  console.error('::error::apply-migrations: SUPABASE_ACCESS_TOKEN is not set')
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`${API}/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`)
  try { return JSON.parse(text) } catch { return [] }
}

/** `060_trial_draft_only_no_clock.sql` -> { version: '060', name: 'trial_draft_only_no_clock' } */
function parseName(file) {
  const m = /^(\d+)_(.+)\.sql$/.exec(file)
  return m ? { version: m[1], name: m[2] } : null
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
const parsed = []
for (const f of files) {
  const p = parseName(f)
  if (!p) {
    console.error(`::error::apply-migrations: "${f}" is not NNN_name.sql`)
    process.exit(1)
  }
  parsed.push({ ...p, file: f })
}

// Hard fail on duplicate version numbers - see the header. Never a warning: a warning here
// means a migration that silently never runs.
const byVersion = new Map()
for (const m of parsed) {
  if (byVersion.has(m.version)) {
    console.error(
      `::error::apply-migrations: duplicate migration number ${m.version}: ` +
      `"${byVersion.get(m.version).file}" and "${m.file}". The ledger keys on the number, so ` +
      `one of these would be skipped forever. Renumber one of them.`,
    )
    process.exit(1)
  }
  byVersion.set(m.version, m)
}

// From here on we have live sockets. process.exit() while a keep-alive socket is open makes
// Node abort with a libuv assertion on Windows, which would fail a deploy that actually
// succeeded. Set exitCode and RETURN instead, letting the event loop drain.
function done(code) { process.exitCode = code }

const applied = new Set(
  (await query('select version from supabase_migrations.schema_migrations'))
    .map((r) => String(r.version)),
)

const pending = parsed.filter((m) => !applied.has(m.version))
if (pending.length === 0) {
  console.log(`apply-migrations: ${projectRef} is up to date (${parsed.length} migrations, 0 pending)`)
  done(0)
} else {

console.log(`apply-migrations: ${projectRef} has ${pending.length} pending:`)
for (const m of pending) console.log(`  - ${m.file}`)
if (dryRun) {
  console.log('apply-migrations: --dry-run, nothing applied')
  done(0)
} else {

for (const m of pending) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8')
  process.stdout.write(`apply-migrations: applying ${m.file} ... `)
  try {
    await query(sql)
  } catch (err) {
    console.log('FAILED')
    console.error(`::error::apply-migrations: ${m.file} failed on ${projectRef}: ${err.message}`)
    console.error('::error::Deploy stopped. The database is PARTIALLY migrated - fix the migration and re-run.')
    done(1)
    break
  }
  // Record only AFTER the statements succeeded, so a failure leaves the version pending
  // rather than marked-done-but-absent. That mismatch is the exact bug this script exists for.
  await query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ('${m.version}', '${m.name.replace(/'/g, "''")}', array[]::text[])
     on conflict (version) do nothing`,
  )
  console.log('ok')
}

if (process.exitCode !== 1) console.log(`apply-migrations: ${projectRef} done, ${pending.length} applied`)
}
}
