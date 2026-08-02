# BoatBuddy — Audit Report (Final)

- **Project:** BoatBuddy (`boatbuddy.predivo.ch`)
- **Date:** 2026-08-01
- **Framework:** Audit Framework v11.0 (behavioral & data-state gates; evidence-mandatory)
- **Stack:** React 19 + Vite 8 + TypeScript, DE-only. **No Supabase Auth by design** (client-side SHA-256 password gate; single shared dataset, no tenants)
- **Deploy status:** Orphan-file cleanup + config + test-harness fixes **LIVE ON PROD** (run `30695608582`). AI-cost DoS deferred (honest open item).

## Audit Summary

| Severity | Before | After | Note |
|---|---|---|---|
| Critical | 0 | 0 | none found |
| High | 1 | 0 | anon-open posture = **by design / accepted**, not a new bug |
| Medium | 3 | 1 deferred | 2 fixed on prod; AI-cost DoS deferred (server-side rate-limit) |
| Low | 3 | 1 deferred | test-guard + backfill fixed; react-router deferred |

*(No fabricated /100 score — severity-count resolution per closeout evidence.)*

## Fixes Applied (by severity)

### Architectural (accepted — by design, not a new bug)
- **Whole DB + `dokumente` storage bucket anon-open via the publishable key** (single shared dataset, no tenants, client password-gate only; `RLS anon_all using(true) with check(true)` on every table). **Cross-tenant IDOR (Gate D) is architecturally N/A** — there are no tenants/users. Flagged and accepted.

### Medium
- **Orphan storage file** — `uploadReceipt` wrote to `dokumente` on file-**select**; abandoning the dialog left an orphan invoice (anon-readable PII) with no DB row. **Fix:** `removeReceipt` + `discardOrphan` on close/unmount, `committedRef` protects saved files — a single choke-point (`AusgabeFormDialog`) covering all 3 upload paths. Commit `3794323`. **LIVE ON PROD.**
- **`config.toml` `verify_jwt` pins** — `extract-expense=false` (in-fn secret gate), `backfill-reservierungen=true`. Commit `0853227`. **LIVE ON PROD.**
- **`extract-expense` AI-cost DoS** — no rate-limit; an unauthenticated caller with the public key can burn the Anthropic budget. **DEFERRED (honest OPEN item)** — a shared-secret header did **not** inline into the vite build (dead-code-eliminated) and is weak anyway (extractable); reverted so uploads work (guard code stays, inert). **Proper fix = server-side rate-limit** (no frontend dependency); low-risk given the anon-open-by-design architecture + personal tool.

### Low
- Test-harness env guard. Commit `3ad6c0f`. **LIVE ON PROD.**
- `backfill-reservierungen` UTC parse — noted (Low).
- react-router v7.15 npm-high — **not reachable in an SPA**; deferred.

## Verification Ledger

| Finding | How verified |
|---|---|
| Orphan storage file | Static-confirmed (`uploadReceipt` writes on file-select); cleanup choke-point in `AusgabeFormDialog`; build+lint+**172 tests** green |
| Live-gate residue | Live-gates agent crashed mid-run but **left NO residue** — verified 0 `ausgaben` + 0 `dokumente` created in the prior 3h on staging (`svpewgbwousyheohlrtt`) |
| Gate A (mobile Save regression — the original trigger bug) | Fix **code-confirmed present** (`max-h-[calc(100dvh-2rem)]` + sticky action bar in `AusgabeFormDialog`); **live browser confirmation crashed** → bucket-3: Roger eyeball on phone |
| Gate E / F / G + mojibake | All clean — migrations `026/027` umlaut fns verified corruption-free on live staging `pg_proc`; `parseLocalDate` DST-safe; float-CHF never mis-displays at current scale (Low/hardening) |
| Gate L (XSS) | Clean — 0 sinks, React auto-escape |

## Open Items
- **AI-cost DoS (`extract-expense`)** — proper fix = **server-side rate-limit** (deferred; low-risk given anon-open-by-design + personal tool). Guard code is inert and ready.
- **Gate A mobile Save button** — fix is code-confirmed present but **not live-confirmed** (browser agent crashed). **Bucket-3: Roger to eyeball on his phone.**

## Overall Health
0 Critical / 0 High remaining (the one High = the anon-open posture, accepted as an architectural design choice for a single-user personal tool). The BoatBuddy-class write-before-commit defect that motivated this whole framework-hardening cycle was hunted directly here: the orphan-storage-file variant was found and fixed on prod, and the mobile-Save regression fix is code-confirmed present. Money, timezone, migration and mojibake gates all clean. **Healthy — the two escaped defect classes (pre-commit residue, off-screen mobile action) are addressed; one server-side rate-limit and one phone-eyeball remain as honest follow-ups.**
