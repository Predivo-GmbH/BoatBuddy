# FIX: the staging test suite drained the boat's engine hours, so staging and the nightly went red (2026-10-02)

## What was red

- **Staging deploy** (every push to main): `deploy-staging` failed at **Unit tests**,
  `tests/integration/critical-paths.test.ts` "Boot Stats > singleton row is present and readable":
  `expected -5.5 to be greater than or equal to 0`. Run
  https://github.com/Predivo-GmbH/BoatBuddy/actions/runs/36948119189 (commit a8d6c91). Nothing reached
  staging after it.
- **Nightly** (04:35 UTC cron): `gate-integration` failed on the same assertion at **-8**. Run
  https://github.com/Predivo-GmbH/BoatBuddy/actions/runs/36966096917. Production cannot be promoted while
  this gate is red.

The value read is staging's `boot_stats.gesamtstunden`, the boat's total engine hours.

## Why

1. The suite created its probe trip log with a direct `insert` into `nutzungslogs`. Only the app's own
   path, the RPC `create_nutzungslog_atomic` (`src/hooks/useNutzungslogs.ts`), adds a log's hours to
   `boot_stats`, so the insert added nothing.
2. Every delete of a `nutzungslogs` row fires `on_nutzungslog_delete` (migration 022), which subtracts
   that row's `betriebsstunden` from `boot_stats`. The suite deletes its own rows in `afterAll`, and a
   killed run's rows in the `beforeAll` orphan sweep.
3. So every suite run took 2.5 hours off staging. That pushed the total below zero: -5.5 (failing
   staging), then -8 (failing the nightly). Each run in `deploy.yml` and in `test.yml` drained it
   further.
4. A repair could not get through. In `deploy-staging`, **Unit tests** ran before **Apply DB
   migrations to staging**, so the failing test stopped the job before any repair migration could
   apply.

PR #26 had only part 1 below, so it could not go green: PR runs never apply migrations, and the
negative value stayed in place.

## The fix: three parts in one commit, because none of them works alone

| Part | File | What it does |
|---|---|---|
| 1 | `tests/integration/critical-paths.test.ts` | The probe log is created through `create_nutzungslog_atomic`, as the app does it. The add (+2.5) and the trigger's subtract (-2.5) now pair up, and that includes a row a killed run leaves behind for the sweep. A run that overlaps with another can only ever see the total go *up* for a moment. (Taken from PR #26.) |
| 2 | `supabase/migrations/032_a_drained_engine_hours_total_is_repaired.sql` | Where `gesamtstunden < 0`, it sets the value to 0 plus the hours of any `[itest]` probe rows still present. Those rows' own cleanup will subtract their hours again, so the value ends at exactly 0. It does not end at a new negative if `test.yml`'s run, which starts in the same second on every push, is part-way through. The migration then checks itself and raises if any negative is left. On production it does nothing: the value is not negative there, and the suite never writes to production. |
| 3 | `.github/workflows/deploy.yml` | `deploy-staging` now runs **Apply DB migrations to staging** after Lint and **before Unit tests**, so the repair reaches staging on the same push that carries it. The production job's order is unchanged. |

Why not a `CHECK (gesamtstunden >= 0)`: the add and the matching subtract are separate statements, so
a CHECK would turn a value that is correct but briefly low into a failed write. The suite's assertion
stays as the tripwire.

## How it was verified

- Locally, before the push, I ran what CI runs: `check-new-functionality-registered`, `npm run lint`,
  `verify-migration-grants`, `npm test -- --run --passWithNoTests` (179 passed; the staging suite
  skips without its key), `npm run build`, `guard-credential-files` (dist and repo), and the offline
  `scripts/*.test.mjs` guard suites (9/9).
- In CI: the push run of this commit has to show `deploy-staging` green, with 032 applied before
  Unit tests and Boot Stats reading >= 0. A gates-only `workflow_dispatch` (confirm is not
  `deploy`, so the production job is skipped) has to show `gate-integration` green. The run links
  are on the board rows listed below.

## Board rows this closes

`alarm-deploy-boatbuddy-github-workflows-deploy-a868177d-r2`,
`alarm-deploy-boatbuddy-github-workflows-deploy-4d8ab0e3`, `signal-BoatBuddy:.github/workflows/deploy.yml:staging`,
`signal-boatbuddy-github-workflows-deploy-yml-staging`, `signal-boatbuddy-github-workflows-deploy-yml-nightly`
(`signal-BoatBuddy:.github/workflows/deploy.yml:nightly` was merged into that last one as a duplicate).

Production was not promoted. That is Roger's "Release now".
