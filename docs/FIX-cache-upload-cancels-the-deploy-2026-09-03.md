# BoatBuddy could not be deployed: two faults, both outside the product

**Date:** 2026-09-03
**Board item:** `boatbuddy-cannot-be-deployed-at-all-right-now-and-its-sa` (HIGH)
**Outcome:** production promoted. Run **33729608920**, `deploy` **job** = success, live site serving the new build.

---

## Summary

BoatBuddy had not been promotable since 2026-09-02. Every attempt ended `cancelled` with the
`deploy` job skipped. Two separate faults were responsible, and **neither was in the product or in
anything the gates were testing**. In both cases every real step in the job had already passed and
the job was killed at its `timeout-minutes` afterwards — which GitHub reports as `cancelled`, which
skips `deploy`, which is a green-looking pipeline that shipped nothing.

Both were read off the failing jobs' own logs. Neither was visible from run colour.

---

## Fault 1 — a 1.81 GB cache upload, killed at the timeout (fixed in `ea74c45`)

`setup-node`'s `cache: npm` save post-step was blowing the job budget.

These jobs run on **persistent self-hosted runners**, where `~/.npm` is not a per-job cache that a
throwaway machine builds and discards. It is a directory holding every package the machine has ever
installed, for every repo on it. Its growth is on the record in the Actions cache store:

| saved | size |
|---|---|
| 2026-08-24 | 81 MiB |
| 2026-09-03 03:46 | 961 MiB |
| 2026-09-03 05:28 (attempted) | 1,811,836,788 bytes |

At the ~1.5 MB/s the runner uploads at, that last one needs roughly twenty minutes. No job in this
pipeline is given that long.

**The receipt** — run `33718969126`, job `gate-integration`, `timeout-minutes: 10`:

```
4. Run npm ci                  -> success    (18s)
5. Integration tests           -> success    (3s)
9. Post Run actions/setup-node -> cancelled  (9m34s)
   "Sent 1006632960 of 1811836788 (55.6%), 1.7 MBs/sec"
   "##[error]The operation was canceled."
```

The cache key is derived from `package-lock.json`, so a **dependency-changing commit misses the key
and triggers the save**. The pipeline therefore broke hardest on exactly the commits that had just
repaired it — `b2e6395` and `dbb02d8` both changed the lock file.

The same post-step killed `gate-e2e` in run `33642219997` ("Post Cache Playwright browsers",
cancelled after 6m16s with the E2E suite already green) and both ten-minute gates in run
`33640629837`.

### A correction to the record

Those three runs were previously recorded as **sessions cancelling each other by concurrency
contention**. They cannot be. `deploy.yml` sets:

```yaml
cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}
```

so dispatched promotions **queue** in the `deploy-production` group and never cancel one another.
Each of those runs died on its own `timeout-minutes`. The earlier note in
`FIX-deploy-blocked-and-integration-gate-timeout-2026-09-02.md` has been corrected in place.

### The fix

`49dfa2c` had already removed `cache: npm` from `gate-security` alone, reasoning that the job never
installs. The install is not what matters — **the upload is** — so the line is removed from the four
remaining jobs in `deploy.yml` and from `staging-gates.yml` and `test.yml`, and the Playwright
`actions/cache` step is skipped on self-hosted runners, where `~/.cache/ms-playwright` persists on
the host anyway.

GitHub-hosted runners (the fallback when `RUNNER_LABEL` is cleared) keep the Playwright cache and
lose only ~15s of uncached `npm ci`. A **"NPM CACHE" note** at the top of `deploy.yml` records the
measurement so the line is not optimised back in. The two stale npm cache entries were deleted so
nothing restores 961 MiB either.

**Effect:** `gate-integration` went from *cancelled at 10m* to **success in 1m48s**.

---

## Fault 2 — the 30-minute crawl was running inside a 20-minute job (fixed in `992860a`)

With fault 1 cleared, the promotion reached `gate-e2e` and was killed there at **20m27s**
(run `33726492534`, `deploy` skipped again). This is not the product being slow.

`playwright.staging.config.ts` is the deploy gauntlet's **smoke** run. Its own comment says so, and
it already excludes `v11-gates.spec.ts` on exactly that reasoning. But its `testDir` is
`./e2e/staging`, and **`gate-a-crawl.spec.ts` lives there and was never excluded** — so every
production promotion was also running the Gate A runtime crawl.

That crawl is not a test with a duration. It drives every trigger on every route at several viewport
widths and descends into whatever state it uncovers, so **its runtime scales with how much data
staging happens to hold**. It sets its own `test.setTimeout(1_800_000)` — thirty minutes — which
overrides the config's 30s `timeout`. `staging-gates.yml` runs it deliberately in a job budgeted at
**40 minutes** (measured 7.8 min/run on 2026-08-24; 17m35s today). `gate-e2e` is budgeted at
**20 minutes**, because it is meant to be the smoke run.

So it fitted while the crawl was short and stopped fitting as staging filled up. In run
`33726492534` it swept `/gastsessions` in 90s (13 triggers), `/nutzung` in 212s (25), `/boot` in
215s (80), and was still working through `/neuigkeiten` when the job was killed. `retries: 1` would
have made a *failing* crawl take twice that.

### The fix

Exclude `gate-a-crawl.spec.ts` here, the same way and for the same reason as `v11-gates.spec.ts`.

**The budget was not widened.** The work that did not belong in the budget was removed — which
matters, because widening a ceiling removes the detection along with the symptom. What remains in
the deploy gauntlet is 13 smoke tests across `authenticated.spec.ts` and `public.spec.ts`.

**Gate A is not weakened.** It still runs daily and on demand in `staging-gates.yml`, green there in
run `33724901564` the same morning. It simply stops sitting in the promotion path, where it was
never meant to be.

**Effect:** `gate-e2e` went from *cancelled at 20m27s* to **success in 56 seconds**.

---

## Proof

Local gates first: `npm run lint` clean, `npx tsc --noEmit` exit 0. All four workflow files parse.

**Run 33729608920**, `workflow_dispatch` with `confirm=deploy`, on `992860a`, job-level:

```
gate-security    : success   07:44:01..07:44:38
gate-integration : success   07:44:02..07:44:35
gate-e2e         : success   07:44:38..07:45:34
deploy           : success   07:45:37..07:47:52
```

Live production, `https://boatbuddy.predivo.ch`, HTTP 200, and it is serving a **new** build:

| | before | after |
|---|---|---|
| `index.html` sha256 | `b0cdff780761fc01…` | `fd2bc60fed3b09d2…` |
| main bundle | `assets/index-B4f2YzT-.js` | `assets/index-iaUiYpPD.js` |

The new bundle answers directly: `assets/index-iaUiYpPD.js` → HTTP 200, 89,933 bytes.
`/.site-id` returns `boatbuddy`, confirming the host that was mirrored.

---

## What was NOT the blocker

- **`fast-uri` (high) / `qs` (moderate).** Real, and patched in the lock file by `dbb02d8`, but it
  was never what blocked the deploy: `gate-security` concluded **success** on `dbb02d8` in run
  `33718969126`, before any of today's changes. Checked first, exactly because the board flagged it
  as an imminent failure.
- **`npm ci` / the lock file.** Repaired by `b2e6395`, confirmed on `origin/main` and green in every
  `npm ci` step today. No lock-file edit was made in this work.
- **Concurrency contention between sessions.** Disproved above.

## Relationship to the "Restart button" row

`boatbuddy-s-failed-deploy-offers-a-restart-button-that-c` does **not** share a cause with this one.
Its two halves were (a) Cockpit's Deploy Status page classifying failures by *step name*, fixed in
Cockpit `a8625bc` and live in Cockpit run `33644091780`, and (b) the npm-version lock-file gap, fixed
in `b2e6395` and proven in run `33633494901`. Both were already fixed **before** the failures
investigated here, and neither is the cache-save post-step nor the crawl-in-the-smoke-config.

## Left open

The failure signature fixed here — **a job `cancelled` at its timeout with every real step green** —
is a class the Deploy Status page has not been shown to read correctly, since it is neither a failed
step nor an obviously transient one. Whether it should offer "Restart" for that is a Cockpit
question, recorded here and handed over rather than built into this session.
