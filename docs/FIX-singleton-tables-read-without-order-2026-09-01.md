# The boat app read its one-row tables without saying which row it wanted — fixed 2026-09-01

Board item: `boatbuddy-singleton-read-without-order`.

## What was wrong

`boot_stats` and `abrechnung_config` are one-row tables **by convention only**. Each was created
with a random-UUID primary key and seeded with a single row, and nothing anywhere said there may
only ever be one. The app then read them with `.limit(1).maybeSingle()` and **no ORDER BY**.

`limit(1)` with no ordering returns whatever row the database reaches first. With one row that is
always the same row, so the bug is invisible. With two it is arbitrary.

**Three reads, and all three matter differently:**

| file | table | why this one hurts |
|---|---|---|
| `src/hooks/useBootStats.ts` | `boot_stats` | the row it reads is then the row it **UPDATEs** — `.eq('id', stats.id)` |
| `src/hooks/useAbrechnung.ts` | `abrechnung_config` | same shape: read a row, write back to that row's id |
| `src/hooks/useKontoberechnung.ts` | `boot_stats.startsaldo` | reads the **same table independently** in the same page load |

So the failure is not "a wrong number appears on screen". It is:

1. **The settings screen edits a row the user was never shown.** The read picks the row, the write
   targets that row's id.
2. **Two reads of the same table in one page load can disagree.** `useBootStats` and
   `useKontoberechnung` query `boot_stats` separately. The balance *shown* on `/finanzen` and the
   balance *edited* in settings could come from different rows.

`src/components/finanzen/MonatsdiagrammChart.tsx:21-25` also uses `.limit(1)` but already carries
`.order('monat', { ascending: false })`, so it is correct and was left alone.

## Why a second row is not hypothetical

Both tables carry `create policy "anon_all" ... for all to anon using (true) with check (true)`, and
BoatBuddy's anon key ships inside the browser bundle. **A second row is one INSERT away from anyone
who opens devtools**, and this product has no login in front of it.

The integration suite already knew. `tests/integration/critical-paths.test.ts` had its whole "Boot
Stats" block marked READ-ONLY on purpose, with a comment explaining that inserting a probe row would
move the account balance on `/finanzen` for every concurrent reader, including the E2E gate. The
hazard was documented and worked around; it had never been removed.

## What changed

**1. The database now enforces it — this is the actual fix.** Migration
`031_a_singleton_table_holds_exactly_one_row.sql` adds `unique ((true))` to both tables. The index
has exactly one possible key, so a second INSERT is rejected by Postgres rather than by hope.

**It refuses rather than choosing.** If a table already holds more than one row the migration raises
and names the row ids instead of creating the index. Deleting one would be picking which of three
owners' real numbers to destroy, with no way to tell which is which. A refused deploy is
recoverable; a deleted `startsaldo` is not. A table with **zero** rows also raises — inventing a
boat's opening balance is not a migration's business.

**2. The reads are deterministic anyway**, in the same commit:
`.order('aktualisiert_am', { ascending: true }).order('id', { ascending: true }).limit(1)`.
Oldest-first because the seeded row is the authoritative one, with `id` as a tiebreak so the order
is *total* and never arbitrary. This is the belt to the constraint's braces: it protects a
developer's local database, which no migration has necessarily reached.

**3. The read-only test became a real proof.** Inserting a second row is now safe *because the
database must refuse it*, so the suite attempts exactly that against staging and asserts error code
`23505` — plus a re-count afterwards, proving the refusal happened before the write rather than
after it. Same pattern and same error code as the existing duplicate-`beitraege` test. A guard
nobody has watched reject something is not a guard.

## Proven

| gate (the ones CI runs, in CI's order) | result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run build` (includes `tsc`) | exit 0 |
| `npm test -- --run --passWithNoTests` | exit 0 — 179 passed, 14 skipped |

The 14 skipped are the staging integration tests, including the two new refusal tests: they are
gated on staging credentials and run in CI's `gate-integration` job against the staging Supabase
project, which is where the constraint is actually exercised.

## Not done, deliberately

**Not promoted to production.** BoatBuddy is customer-facing. A push to `main` deploys **staging
only** — production is `workflow_dispatch` with a typed confirmation — so this change proves itself
on staging and Roger promotes it himself.

**No credentials file was opened at any point.** BoatBuddy has no user accounts, so its single
shared password is the whole front door for three owners. Everything above came from the migrations,
the source and the test suite.
