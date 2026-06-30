# BoatBuddy — Session Handoff, 2026-06-30

Complete record of the day's work so the chat can be closed without losing anything.
Related canonical docs: `CHANGE_WORKFLOW.md` (how changes ship), `FEATURE_REGISTRY.md`
(feature list + tests), `Credentials.txt` (staging env + secrets).

---

## 1. Ownership change — Jan added as equal 3rd co-owner (production DATA)

Boot › Eigentümer now shows three equal owners (CHF figures derive from `anteil_prozent × 55'000`):

| Owner | anteil_prozent | Shows | Since |
|-------|----------------|-------|-------|
| Dani | 33.3327 | CHF 18'333 | 01.09.2021 |
| Jan (new row) | 33.3327 | CHF 18'333 | 01.07.2026 |
| Roger | 33.3346 | CHF 18'334 | 01.09.2021 |
| **Total** | **100.0000%** | | |

News entry added: *"Gleiche Eigentumsanteile – alle drei zu je 1/3"* (Dani & Jan paid Roger the difference).
**Method:** direct DB update of the `eigentuemer` rows (business data → not a deploy). Verified live.

## 2. Bootkonto reset to a fresh CHF 1'200 (production DATA)

Gas money (CHF 78.55, reimbursed to Dani) + two owner payouts (Roger 507.25 + Dani 507.25 =
1'014.50) were taken out of the CHF 2'214.50 balance, leaving **CHF 1'200** (the three July
contributions). Implemented by setting `boot_stats.startsaldo` so the calculated balance = 1'200
(67'470.10). News entry: *"Bootkonto-Neustart – Überschuss ausbezahlt"*. Verified live on Finanzen.

> Lesson banked: recompute the *calculated* balance LIVE before any startsaldo reset — an early
> read was stale (taken just before the gas reimbursement applied) and briefly showed 2'293.05.

## 3. NEW: staging-first deploy pipeline + change-workflow policy  ← the main deliverable

Triggered by the "shouldn't this go staging→prod?" discussion. BoatBuddy was the last project still
auto-deploying prod on push. It now matches the house standard (ReplyFlow/Valrano).

**Staging environment** (all provisioned + verified):
- `https://staging.boatbuddy.predivo.ch` — Basic-auth (`staging`/`predivo2026`), noindex, wildcard SSL
- Staging Supabase `svpewgbwousyheohlrtt`, synced to prod schema (migrations 019–027)
- Same FTP creds as prod (same predivo.ch subscription) — see Credentials.txt

**Pipeline (`deploy.yml`):**
```
push main → validate-staging → deploy-staging → e2e-staging → ⛔ manual gate → deploy(prod)
```
- **Push to main deploys to STAGING only.** It cannot reach production.
- **Production:** `gh workflow run deploy.yml -f confirm=deploy` (re-runs staging + E2E, then prod).
- **DB migrations** are not auto-applied: apply to staging first, then prod (Management API / SQL).

**Policy (`CHANGE_WORKFLOW.md`):** code/schema → staging-first + manual gate · business data →
app UI · direct prod DB → break-glass only.

## 4. Account-reset feature — built, shipped, then REMOVED

Built a "Kontostand zurücksetzen" feature (Boot › Abrechnung) so resets wouldn't need manual SQL,
shipped it through the new pipeline to prod, then **removed it the same day** at Roger's request
(rare operation; the target field's placeholder showed a float artifact `1200.000000000009`).
Fully gone: UI + hook + migration 028 + `reset_kontostand` DB function (dropped on staging & prod)
+ E2E test + registry entry. Account resets remain a **manual** operation by choice.

## 5. Testing status — GREEN ✅

- **Critical Path Tests** (72 covered features, runs against prod on every push): **passing.**
- **Deploy pipeline** (lint + unit + integration + staging E2E): **passing.**
- One stale assertion was caught and fixed: the ownership test still expected the old 72.7%/27.3%
  split; updated to the new 33.3%×3. (Reminder: a pure-DB data change doesn't trigger `test.yml`,
  so update asserting tests when you change the data they check.)

---

## Current production state (as of close)
- Ownership: Dani/Jan/Roger = 18'333 / 18'333 / 18'334 (33.3% each), total 100%.
- Bootkonto calculated balance: **CHF 1'200.00**.
- Latest prod commit deployed: `90acb20` (feature) → superseded by removal `d2d9467`; test fix `651d455`.
- No feature pending; CI green; nothing left half-done.

## If you need an account reset again
Do it manually (Roger's preference): set `boot_stats.startsaldo` so
`startsaldo + beiträge + gastsessions(eingezahlt) − ausgaben(bootkonto) − erstattungen = target`,
then add a Neuigkeiten entry. Or ask Claude to do the break-glass edit + log.
