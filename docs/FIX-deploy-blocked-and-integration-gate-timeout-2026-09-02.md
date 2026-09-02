# Fix — BoatBuddy could not be deployed at all, and its safety gate failed while every test passed

**Date:** 2026-09-02 · **Board row:** `boatbuddy-cannot-be-deployed-at-all-right-now-and-its-sa`

Two unrelated faults were sitting behind one sentence. They had to be found separately because the
first one hid the second: nothing downstream of `npm ci` ever ran.

---

## Fault 1 — every job died at its first step

`npm ci` refused the lock file:

```
npm error `npm ci` can only install packages when your package.json and package-lock.json ... are in sync
npm error Missing: @emnapi/core@1.11.3 from lock file
npm error Missing: @emnapi/runtime@1.11.3 from lock file
```

Every job in the deploy pipeline begins with `npm ci`, so `deploy-staging` failed at step one and
`gate-security`, `gate-integration`, `gate-e2e` and `deploy` were **all skipped behind it**. That is
the literal "cannot be deployed at all".

### Why the lock file was wrong

The lock file was last regenerated on the dev machine, which runs **npm 11** (node 24). CI runs
**node 22 — npm 10.9** (`actions/setup-node@v5`, `node-version: 22`, five times in this workflow).
npm 11 omits two transitive wasm packages under `@tailwindcss/oxide-wasm32-wasi` that npm 10.9
requires. So a lock file that is perfectly valid on the machine that wrote it is refused by the
machine that has to use it.

This was not deduced, it was reproduced. In an isolated worktree from `origin/main`:

| what was run | result |
|---|---|
| `npm install --package-lock-only` with the **local** npm 11.6.2 | `@emnapi/core` still absent — the fix does not appear |
| `npm install --package-lock-only` with **npm 10.9.2**, the version CI runs | `@emnapi/core` and `@emnapi/runtime` both present |
| `npm ci` with npm 10.9.2 against that lock file | **exit 0**, 639 packages |

**The generalisable part: reproduce a CI dependency failure with CI's npm, not with the npm that
happens to be installed here.** `npx -y npm@10.9.2 ...` is enough; nothing has to be installed
globally.

A peer session had meanwhile pushed the same two entries by hand as `b2e6395`, so that commit was
verified rather than duplicated: `gate-security` ran `npm ci` successfully on `b2e6395`, which is
the proof the blocker is gone.

**Preventive note, not fixed here:** nothing stops this recurring the next time someone runs
`npm install` on the dev machine. Pinning the toolchain (a `packageManager` field, or `engines`
plus a CI check that the lock file is unchanged after `npm install --package-lock-only`) is the
durable fix and belongs to its own row.

---

## Fault 2 — the safety gate failed while every test passed

With `npm ci` working, `gate-integration` reported:

```
Test Files  1 failed (1)
     Tests  13 passed (13)
Error: Hook timed out in 10000ms.
 ❯ tests/integration/critical-paths.test.ts:132:1
```

All thirteen critical-path tests passed. What failed was the `afterAll` tidy-up.

That hook deletes each row this run created **one at a time**, then re-queries every table to prove
they are gone — over twenty round trips to a hosted database about 600 ms away — against vitest's
**default 10 second hook timeout**. Two consequences, and the second is worse than the first:

1. the gate reported a broken product when nothing about the product was broken;
2. a tidy-up cut off halfway leaves exactly the residue the suite's own isolation rules exist to
   prevent, so the *next* run gets judged on this run's rows.

### What changed (`d2c5685`)

- deletes are **batched per table** — one `.in('id', ...)` instead of one call per row — and the
  verification queries run **in parallel**, taking the tidy-up from ~20 sequential round trips to
  roughly one per table. Tables are still emptied in reverse order of first write, so no foreign key
  can be orphaned; only the per-row chatter inside a table is collapsed.
- both housekeeping hooks (`beforeAll` sweep, `afterAll` tidy-up) get an explicit **120 s** timeout.
  A hook that must not be interrupted should never be racing a default chosen for ordinary
  assertions.

Nothing was weakened: the tidy-up still re-queries and still throws if a single row survives.

---

## Proof

Verified locally first with the gates CI runs — `npm run lint` clean, `npx tsc --noEmit` exit 0 —
then on CI. Run **33638593851** on `d2c5685`:

```
gate-integration = success
gate-security    = success
deploy-staging   = skipped
deploy           = skipped
```

Dispatched with `confirm=verify-gates-only`. The production job requires `confirm == 'deploy'`, so it
skipped and **nothing was released** — BoatBuddy is customer-facing and the production promotion
stays Roger's.

## Stated gap

`gate-e2e` was **cancelled**, not failed, in that run and in the nightly before it — several sessions
were dispatching this workflow at once and the runs contend for the same concurrency group. So the
E2E gate is unproven today. It is unrelated to either fault above (both of those are now green) but
it is not evidence, and it is recorded here as missing rather than glossed.
