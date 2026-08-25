# Pre-release checks failing for reasons unrelated to the change

**Date:** 2026-08-24
**Repo:** BoatBuddy
**Work board item:** `gate-integration-test-isolation-staging-db-carries-state`
**Files changed:** `tests/integration/critical-paths.test.ts`, `.github/workflows/deploy.yml`

---

## 1. The reported cause was wrong, and it is now corrected on the record

The board item said: *"Gate-integration flakiness: the staging DB carries state between runs.
Commit `c21399ab` failed at 08:08Z and passed on rerun at ~08:26Z with no code change."*

That run is `32627468933`, attempt 1, 2026-08-23. Its log says something different:

```
FAIL  Ausgaben (expenses) > expense with dokument_pfad and verarbeitungs_status
AssertionError: expected { Object (message) } to be null
+ Received:
{ "message": "<html>
<head><title>502 Bad Gateway</title></head>
<center><h1>502 Bad Gateway</h1></center>
<hr><center>cloudflare</center>
```

All three failures were Cloudflare **502 Bad Gateway** responses from staging PostgREST.
The one that reads as a database-state failure, `expected undefined to be '23505'`, is the
same 502: the duplicate insert came back as an HTML error page, and an HTML error page has
no Postgres `code`, so `dupError.code` was `undefined`.

That cause was already fixed on 2026-08-23 at 16:25Z by commit `8318bb8`, which added the
retry wrapper in `tests/integration/_transient.ts`.

So the item as written was closed before it was opened. What follows is the isolation work
that was **genuinely** missing, found by looking at the suite rather than at that one run.

## 2. What was actually broken

**a. Nothing ever collected orphaned rows.** Cleanup was `afterAll`, deleting by id, with the
result discarded. `test.yml` sets `cancel-in-progress: true`, so a superseded run is killed
mid-suite and `afterAll` never runs at all. Rows left that way stayed forever and nobody was
told. This is the real "carries state between runs" mechanism, and it is routine rather than
hypothetical.

**b. A rerun reused the dates of the attempt that had just left rows behind.** The per-run
date offset was derived from `GITHUB_RUN_ID`, which is **unchanged** when a failed run is
re-run. `GITHUB_RUN_ATTEMPT` was not in the key.

**c. The suite inserted a second `boot_stats` row.** `boot_stats` is a singleton: the app reads
it with `.limit(1).maybeSingle()` and **no `ORDER BY`** (`src/hooks/useBootStats.ts:12-15`,
`src/hooks/useKontoberechnung.ts:21`). While the test row existed, which row the staging site
saw was arbitrary, and the test row carried no `startsaldo`, which silently moved the account
balance shown on `/finanzen`.

**d. The two gates that share one database ran at the same time.** `gate-integration` and
`gate-e2e` in `deploy.yml` had no ordering between them. `gate-integration` writes a 400 CHF
Beitrag and a 1250.50 bootkonto Ausgabe, both summed by `useKontoberechnung`, while `gate-e2e`
loads `/finanzen` and `/dashboard`.

**e. Shifted dates could still land on real seed data.** Staging carries a hand-seeded
`beitraege` set on the 1st of every month of 2026 for roger/dani/jan. A 2026 base date plus an
offset can land exactly on one of those and fail on a unique violation.

**f. Two comments in the suite were stale.** Migration `028` dropped
`reservierungen (datum, fahrer)` and replaced it with the GiST exclusion constraint
`reservierungen_no_overlap`. `deploy.yml`'s `gate-integration` is skipped on push, so the two
workflows do not both run the suite on a push, as the old comment claimed.

## 3. What changed

**Marker.** Every row the suite writes now carries `[itest] run=<runId>.<attempt>` in its
`notiz` column. All seven written tables have `notiz` and `erstellt_am`, checked against
`supabase/migrations`. Real staging data and the Gate A fixtures never carry the prefix.

**Sweep.** `beforeAll` deletes marked rows older than a 30 minute grace window, across all
seven tables, and fails loudly if the delete errors. A run that is still in flight is younger
than the window, so a concurrent run is never touched.

**Proven cleanup.** `afterAll` deletes this run's rows and then re-queries every written table
for this run's marker. Anything that survives raises an error naming the table and the count.
A swallowed delete error is no longer possible.

**Run key includes the attempt**, so a rerun never reuses the dates of the attempt before it.

**`boot_stats` is read-only in the suite.** The test now asserts the singleton is present,
readable, and that there is exactly **one** row. That length assertion is itself the isolation
check: if any run ever leaves a second row behind, this fails and names it.

**`gate-e2e` is serialized behind `gate-integration`** in `deploy.yml`, with
`if: !cancelled()` so the E2E signal still reports when integration goes red. Production stays
blocked either way, because the `deploy` job needs both.

**Base dates moved to 2031** for everything that feeds a constraint, away from the seeded 2026
rows.

## 4. Proof

Run against the live staging project `svpewgbwousyheohlrtt`, not a mock.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint tests/integration/critical-paths.test.ts` | clean |
| Suite against staging | 12 passed |
| Residue after the run (all 7 tables queried for the marker) | `[]` on every table |
| Orphan injected: marked `beitraege` row stamped 2 hours old, then suite run | row gone, 12 passed |
| Concurrent run simulated: marked row stamped now, then suite run | row **survived**, as intended |
| Contamination injected: second `boot_stats` row, then suite run | `singleton row is present and readable` **FAILED**: `expected [ { …(8) }, { …(8) } ] to have a length of 1 but got 2` |
| Staging restored | `beitraege` 30 seed rows, `boot_stats` 1 row, marker residue `[]` |

The last two lines are the ones that matter: the guard catches contamination rather than
tolerating it, and the sweep does not eat a concurrent run's work.

Then in real CI, not only locally:

| Run | Result |
|---|---|
| `32780230765` Critical Path Tests, commit `8d3044a` | `Tests 12 passed (12)`, critical-path `72 passed` |
| `32780230732` Deploy, staging lane, same commit | success |
| Marker residue in all seven tables after that CI run | empty on every one; `boot_stats` back to exactly 1 row |
| `32817771415` Deploy, full gauntlet, `confirm=no` | see below, this is the run that exercises the new `gate-e2e` ordering |

Gauntlet run `32817771415` (`confirm=no`, commit `8d3044a`, 2026-08-25):

```
gate-integration: success
gate-e2e:         success   <- started 06:38:10Z, AFTER gate-integration finished
gate-security:    failure   <- NOT this change, see below
deploy-staging:   skipped
deploy:           skipped   <- correct, the job requires confirm == 'deploy'
```

`gate-e2e` starting only after `gate-integration` completed is the serialization working. Before
this change the two started together and shared the staging database at the same moment.

`gate-security` failed for a reason that has nothing to do with this work, which is worth naming
precisely because it is the same class of problem this whole item is about. Its log:

```
python3 -m pip install --quiet semgrep
error: externally-managed-environment
x This environment is externally managed
```

That is PEP 668. The step never installed semgrep and never scanned anything. It appeared with
the move to self-hosted runners (`a3447d4`, 2026-08-24 15:30Z); the last green `gate-security`
was run `32698878410` on `24f61d5`, which still ran on a GitHub-hosted box. Ubuntu 24.04's
system python refuses a system-wide `pip install`. This is recorded here and handed over as its
own piece of work, NOT fixed inside this item. It matters: the `deploy` job needs
`gate-security`, so while it is red no BoatBuddy production promotion can pass, and the runner
migration covered the whole fleet, so other repos are likely in the same state.

## 5. There is nothing here to promote to production

Asked on 2026-08-25 whether this still needs a production promotion. It does not, and here is
why, with the checks that prove it rather than an assurance.

Commit `8d3044a` touched three files: `.github/workflows/deploy.yml`,
`tests/integration/critical-paths.test.ts`, `docs/GATE-INTEGRATION-ISOLATION-2026-08-24.md`.
**No application source file.**

Widening to everything on `main` since the last production promotion (`24f61d5`, run
`32698878410`, 2026-08-24 06:49Z), ten commits landed and
`git diff --name-only 24f61d5..8d3044a -- src public index.html package.json vite.config.ts supabase/`
returns exactly one file: `package.json`. That diff is a single line,
`@predivo-gmbh/gate-kit ^0.2.5` to `^0.2.11`, and gate-kit is:

- in `devDependencies`, not `dependencies` (`node -e` over package.json returns
  `dependencies gate-kit: []`), and
- imported nowhere under `src/` (`grep -rn "gate-kit" src/` returns nothing).

So the built bundle is unchanged from what production already serves. A promotion would ship
the identical site. **The correct closeout for this item is no promotion at all**, not a
no-op deploy that muddies the production history.

What the change does need is a run of the FULL gauntlet, because the `gate-e2e` ordering only
takes effect on a `workflow_dispatch` or the nightly schedule, never on a push. That was run
deliberately with `confirm=no` (run `32817771415`), which exercises every gate in the new
serialized order and cannot reach the `deploy` job, since that job requires
`confirm == 'deploy'`. Result recorded in section 4.

## 6. Left alone deliberately

`useBootStats.ts:12-15` and `useKontoberechnung.ts:21` read a singleton table with `.limit(1)`
and no `ORDER BY`. With one row that is harmless, and production has one row. It is noted here
rather than changed, because it is app code and outside this item.
