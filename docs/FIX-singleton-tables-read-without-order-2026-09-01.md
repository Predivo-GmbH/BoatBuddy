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

**3. The tests assert the invariant, and I got this wrong once — recorded because the mistake is
structural, not careless.**

My first attempt added a test that inserted a second row and expected `23505`. It failed in CI, and
worse than failing: **the insert succeeded**, leaving a marked row in each table on staging — exactly
the corruption the read-only comment had been protecting against since it was written.

The cause is an ordering fact about the workflow, not a slip: `deploy-staging` runs `npm test` at
step 4 and **`Apply DB migrations to staging` at step 11**. The unit-test step therefore runs against
the schema *as it was before this commit's migrations*. On the very push that introduces a
constraint, a test asserting that constraint runs before the constraint exists. A test that must
write in order to prove a negative is a bad trade in a shared database.

What is in place instead:

- **The migration proves itself.** `031`'s receipts block raises if either unique index is missing
  after apply, so the constraint cannot be silently absent.
- **The suite proves the invariant continuously**, without writing: `boot_stats` and now also
  `abrechnung_config` are asserted to hold exactly one row. With the constraint in place, those can
  only fail if something removed it.
- **The residue is swept.** `beforeAll` now deletes any marked row from both singleton tables. They
  are not in `WRITTEN_TABLES` because that loop filters on `erstellt_am`, a column neither table has.
  No date grace window: a genuine singleton row never carries the test marker, so anything marked is
  residue and goes immediately. That sweep runs *before* the migration step, so the next run clears
  the two stray rows and then `031` applies cleanly against one row per table.

## Proven

| gate (the ones CI runs, in CI's order) | result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run build` (includes `tsc`) | exit 0 |
| `npm test -- --run --passWithNoTests` | exit 0 |

**And CI itself, which is the part that matters** — the first push (`8d4589f`) went **red**, which is
how the ordering fault above was found rather than assumed. Run `33556798001`: `deploy-staging`
**failure**, `2 failed | 191 passed`, and every downstream job (`gate-security`, `gate-integration`,
`gate-e2e`, `deploy`) correctly **skipped**, so nothing shipped on a red gate. The follow-up commit
removes the premature test, adds the residue sweep, and is what should be judged.

The staging integration tests are gated on staging credentials, so they are skipped locally and run
in CI against the staging Supabase project.

## Not done, deliberately

**Not promoted to production.** BoatBuddy is customer-facing. A push to `main` deploys **staging
only** — production is `workflow_dispatch` with a typed confirmation — so this change proves itself
on staging and Roger promotes it himself.

**No credentials file was opened at any point.** BoatBuddy has no user accounts, so its single
shared password is the whole front door for three owners. Everything above came from the migrations,
the source and the test suite.
