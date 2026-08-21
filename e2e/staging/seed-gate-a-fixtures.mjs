/**
 * Seed the staging rows that two Gate A surfaces need in order to exist at all.
 *
 * WHY THIS EXISTS. GastsessionTabelle and NutzungslogTabelle render their edit dialog PER ROW
 * (GastsessionTabelle.tsx:260 -> :316). With both tables empty on staging there is no edit
 * button anywhere, so the crawl reported zero row-level triggers and those two dialogs could
 * never be opened. Measured 2026-08-21: the crawl saw 7 of this product's 9 dialog surfaces,
 * and the two it missed are exactly these.
 *
 * "Empty on staging" is not "unused": both dialogs render for any real user who has a row, and
 * a surface nobody can test is how this product shipped seven panels whose commit control fell
 * off a short screen while its crawl reported it CLEAN.
 *
 * IDEMPOTENT. It looks for its own marker rows first and inserts only what is missing, so it is
 * safe to run before every crawl. It touches nothing that is not marked as a fixture.
 *
 *   STAGING_SUPABASE_URL=... STAGING_ANON_KEY=... node e2e/staging/seed-gate-a-fixtures.mjs
 *
 * The anon key is enough: both tables carry an `anon_all` RLS policy
 * (supabase/migrations/004_gastsessions.sql, 005_nutzungslogs.sql).
 */
const url = process.env.STAGING_SUPABASE_URL
const key = process.env.STAGING_ANON_KEY

if (!url || !key) {
  console.error('seed: STAGING_SUPABASE_URL and STAGING_ANON_KEY are required')
  process.exit(1)
}

const MARKER = 'E2E Gate A fixture'
/** Far enough in the past that it never collides with real data or the calendar view. */
const FIXTURE_DATE = '2019-07-04'

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : []
}

async function ensure(table, findQuery, row, describe) {
  const existing = await rest(`${table}?${findQuery}&select=id&limit=1`)
  if (existing.length) {
    console.log(`  ok      ${table}: ${describe} already present (${existing[0].id})`)
    return existing[0].id
  }
  const [created] = await rest(table, { method: 'POST', body: JSON.stringify(row) })
  console.log(`  seeded  ${table}: ${describe} (${created.id})`)
  return created.id
}

const gastsession = {
  gast_name: MARKER,
  betrag: 25.0,
  bezahlt_an: 'roger',
  datum: FIXTURE_DATE,
  notiz: 'Row exists so the Gate A crawl can open GastsessionTabelle edit dialog. Safe to delete.',
}

const nutzungslog = {
  datum: FIXTURE_DATE, // the table has a UNIQUE constraint on datum, so this is the identity
  fahrer: 'roger',
  betriebsstunden: 1.0,
  treibstoff_liter: 1.0,
  aktivitaeten: [],
  notiz: `${MARKER} - row exists so the Gate A crawl can open NutzungslogTabelle edit dialog. Safe to delete.`,
}

console.log('seed: Gate A row fixtures on staging')
await ensure('gastsessions', `gast_name=eq.${encodeURIComponent(MARKER)}`, gastsession, 'gastsession row')
await ensure('nutzungslogs', `datum=eq.${FIXTURE_DATE}`, nutzungslog, 'nutzungslog row')
console.log('seed: done')
