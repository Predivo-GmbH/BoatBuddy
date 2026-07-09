# BoatBuddy — Bootkonto Money-Model Correctness & Reconciliation Audit

**Date:** 2026-07-07 · **Auditor:** Claude (Fable 5), adversarial read of SHIPPED code only
**Scope:** calculated saldo (`useKontoberechnung`), open items (`AbrechnungCard`, `OffenePostenCard`), snapshots (`useKontostand`), entry paths (`useAusgaben`/`useGastsessions`/`useBeitraege`), ownership math (`BootPage`), migrations 010/011/023 + changelog triggers.
**No code or data was changed. No DB writes. No deploy.**

Real money model (for reference), from `src/hooks/useKontoberechnung.ts:50`:

```
saldo = startsaldo + Σ beiträge + Σ gastsessions[auf_konto_eingezahlt]
        − Σ ausgaben[bezahlt_von='bootkonto'] − Σ ausgaben[bezahlt_von≠'bootkonto' ∧ erstattet]
```

---

## Ranked defects

### D1 — HIGH · Orphaned receipt-scan rows (`bezahlt_von=''`, real CHF amount) fall through the Abrechnung view and pollute expense stats

**Where:**
- Placeholder insert: `src/pages/FinanzenPage.tsx:99-109` (`bezahlt_von: ''`, `betrag: 0`) and `src/components/finanzen/AusgabeFormDialog.tsx:129-141` (same shape).
- Edge function writes the REAL amount into that row unconditionally: `supabase/functions/extract-expense/index.ts:250-262` (`betrag: extracted.betrag`, `verarbeitungs_status: 'fertig'`).
- Dialog close does NOT delete the linked row: `AusgabeFormDialog.tsx:194-202` (`close()` only resets React state).
- `AbrechnungCard.tsx:33-36` silently drops it: `const person = a.bezahlt_von` → `result['']` is `undefined` → amount discarded.
- `OffenePostenCard.tsx:25-29` DOES show it (no person guard), with a blank payer name at line 103.

**Worked CHF example:** Roger scans a CHF 87.50 Landi receipt via "Foto mit Handy", extraction finishes, he closes the browser tab instead of pressing Speichern. The DB now holds `{betrag: 87.50, bezahlt_von: '', erstattet: false, status: 'fertig'}` forever. Effects:
- Calculated saldo: unaffected (correct by luck — `'' ≠ 'bootkonto'` and `erstattet=false`).
- Dashboard "Offene Posten": shows "87.50 · Bezahlt von __ · Erstattung offen" — un-actionable attribution.
- Finanzen → "Offene Abrechnungen": shows **nothing** (silently dropped) → the two open-items views disagree by CHF 87.50.
- "Ausgaben 2026" tile (`FinanzenPage.tsx:42-48`), `MonatsdiagrammChart`, `KategorieChart`: all count the 87.50 as a real expense. The Neuigkeiten trigger (`021_changelog_ausgaben_extraction.sql:29-48`) also announces "Ausgabe: … CHF 87.50" although nobody confirmed it.
- If the user abandons BEFORE extraction completes, a `betrag: 0` "Handy-Foto" row additionally inflates the expense COUNT.

**Fix direction (not applied):** delete the linked row on dialog abandon, or exclude `verarbeitungs_status`-pending / `bezahlt_von=''` rows from every aggregate, and surface `bezahlt_von=''` rows as "needs payer" instead of dropping them.

---

### D2 — HIGH · Startsaldo anchor can be silently double-counted: pre-cutoff rows remain freely togglable

**Where:**
- The anchor: `supabase/migrations/011_startsaldo.sql:3` + `useKontoberechnung.ts:29-30` — startsaldo exists to make the all-history sum equal the real bank balance, i.e. it *absorbs* every pre-anchor flow whose flags say "open".
- The cutoff exists ONLY in `AbrechnungCard.tsx:16,31,42` (`SETTLEMENT_CUTOFF='2026-05-29'`).
- No cutoff guard in `GastsessionTabelle.tsx:229-243` (toggle "Eingezahlt" on ANY historical session), `OffenePostenCard.tsx:37-69` (mark ANY expense erstattet / ANY session eingezahlt), or `useKontoberechnung.ts:36-48` (sums flags across all history).

**Worked CHF example:** On 2026-05-29 all historical items were bulk-settled outside the app and `startsaldo` was set so calculated saldo = bank = CHF 1200.00 — while e.g. a 2025-08-10 gastsession (CHF 25, cash kept by Dani, `auf_konto_eingezahlt=false`) stayed flagged open. Its CHF 25 is therefore *inside* the anchor. If Dani later taps the amber "Offen" pill in GastsessionTabelle (nothing stops him — the row renders like any other), saldo jumps to **CHF 1225.00** while the bank still holds 1200.00. Same class of drift for pre-cutoff private expenses toggled "erstattet" (saldo drops although no money moved after anchoring). The app has no reconciliation display that would ever reveal the 25.
The inverse also holds: `delete_changelog_cascade` (`023_changelog_erstattung.sql:42`) un-marks an Erstattung when its News entry is deleted — on a pre-cutoff row that shifts saldo the other way.

**Fix direction:** persist the anchor date next to startsaldo and either freeze flag toggles for rows dated ≤ anchor, or exclude pre-anchor rows from the flag sums entirely (they are represented by startsaldo).

---

### D3 — HIGH · Deleting a Neuigkeiten entry hard-deletes financial source rows — including already-banked money

**Where:** `supabase/migrations/023_changelog_erstattung.sql:35-53` — `delete_changelog_cascade(uuid)` is `security definer`, `grant execute … to anon` (line 53), and for `quelle_typ in ('ausgabe','gastsession','beitrag','kontostand')` it DELETES the source row.

**Worked CHF example:** The News entry "Gastsession: Marco (CHF 25)" refers to a session already marked `auf_konto_eingezahlt=true` — the CHF 25 is physically in the bank and inside the calculated saldo. Anyone tidying the News feed deletes that entry → the gastsession row is deleted → calculated saldo drops CHF 25 below the real bank balance, permanently and without any warning that a *money* record (not just a log line) was destroyed. Deleting a "Beitrag: Jan – CHF 400" entry likewise erases a real CHF 400 bank inflow from the model. Only the `erstattung` type gets the safe treatment (un-mark instead of delete, line 42).

**Fix direction:** for money rows in a settled/banked state (`erstattet=true`, `auf_konto_eingezahlt=true`, any beitrag), the cascade should refuse or soft-archive rather than delete; at minimum the UI confirm dialog must say "deletes the underlying CHF X record".

---

### D4 — MEDIUM · Two sources of truth: `kontostand_snapshots` exists, is trigger-logged, but is never reconciled against the calculated saldo

**Where:**
- `src/hooks/useKontostand.ts` (whole file) — fetch + `createSnapshot` mutation exist, but a repo-wide search shows **no component imports `useKontostand`**; the hook is dead UI code.
- The snapshot table still participates in the system: insert trigger logs "Kontostand: CHF …" to Neuigkeiten (`019_changelog_auto_logging.sql:157-173`) and the cascade can delete snapshots (`023:47`).
- Displayed balance is exclusively the calculated one: `KontoBilanzCard.tsx:7-9`, `DashboardPage.tsx:40`.

**Worked CHF example:** Calculated saldo says CHF 1200.00. Someone inserts a snapshot `betrag=1174.35` (real e-banking figure — bank fees of CHF 25.65 that no ausgaben row captures). Nothing anywhere compares 1200.00 vs 1174.35; the app keeps asserting 1200.00. The divergence is undetectable inside the product.

**Canonical-source recommendation (one-way-door):** make the **calculated saldo (`useKontoberechnung`) the single canonical balance**, and demote `kontostand_snapshots` to *reconciliation checkpoints*: keep the table, but its only UI role should be a "last verified against bank: CHF X on DATE, delta to calculated: CHF Y" line, with any non-zero delta rendered as an alert. Rationale: (a) the calculated saldo is already the only thing users see, so canonizing it changes nothing user-visible; (b) it is derivable and auditable row-by-row, snapshots are opaque assertions; (c) snapshots-as-canonical would resurrect exactly the manual-drift problem startsaldo (migration 011) was built to solve. Do **not** delete the snapshot table — a derived balance with no external checkpoint is how D2-class drift stays invisible.

---

### D5 — MEDIUM · Dashboard and Finanzen disagree on what an "open item" is (cutoff applied in one view only)

**Where:** `AbrechnungCard.tsx:31,42` skips `datum <= '2026-05-29'`; `OffenePostenCard.tsx:25-33` has no date filter at all.

**Worked CHF example:** A CHF 50 expense dated 2026-05-20, `bezahlt_von='dani'`, `erstattet=false`: Dashboard shows an orange "Offene Posten (1) … 50.00 Erstattung offen"; Finanzen → Offene Abrechnungen shows "Keine offenen Posten — alles ausgeglichen." Both cards claim to describe the same reality. (Boundary itself: `<=` means items dated exactly 2026-05-29 count as bulk-settled — consistent with the comment "created after this date" at `AbrechnungCard.tsx:15`, so the `<=`-vs-`<` choice is internally coherent; the defect is the missing filter in the *other* view.)

---

### D6 — MEDIUM · "Saldo" in the year chart mixes cash-basis income with accrual expenses

**Where:** `MonatsdiagrammChart.tsx:55-61,67-69` — Einnahmen counts only `auf_konto_eingezahlt` sessions (bank view), but Ausgaben counts **all** expenses regardless of payer/erstattet (economic view). Same mix in the "Ausgaben {year}" tile `FinanzenPage.tsx:42-48`.

**Worked CHF example:** Year with one CHF 400 beitrag, one CHF 25 guest session not yet deposited, one CHF 300 expense paid privately by Jan, not reimbursed. Chart shows Einnahmen 400, Ausgaben 300, "Saldo +100". Bank reality: +400 (nothing left the bank). Economic reality: +125. The displayed +100 is neither.

---

### D7 — MEDIUM · CHF math is IEEE-754 floats end-to-end; sign test on the headline number

**Where:** every reduce in `useKontoberechnung.ts:33-50`, `FinanzenPage.tsx:45,52-57`, `EinnahmenTabelle.tsx:103`, `MonatsdiagrammChart.tsx:52-61`; sign check `KontoBilanzCard.tsx:10` (`saldo >= 0`).

**Worked CHF example (the 1200.000000000009 class):** `startsaldo 1199.90 + beitrag 400 + gastsession 25.10 − ausgabe 424.99 − erstattung 0.01` evaluates in float to `1200.0000000000002`, and mirrored sequences can produce `-2.3e-13` for a true 0.00 — `KontoBilanzCard` then renders "CHF −0.00"/red for a balanced account. Display is saved by `Intl.NumberFormat` rounding (`format.ts:21-25`), but any future equality/threshold logic (e.g. the planned "reset to 1200" feature) inherits the dirt.
**Fix direction:** sum in integer Rappen (`Math.round(Number(x)*100)`), divide by 100 only at render; assert `Number.isInteger(cents)`.

---

### D8 — MEDIUM · Ownership-share math: independent per-owner rounding, a tolerance that hides CHF 55, and a schema that cannot express 1/3

**Where:** `BootPage.tsx:235` (`Math.round((anteil/100) * bootWert)` per owner, independently), `BootPage.tsx:254-265` (green check for `|total−100| < 0.1`), `009_ws3_ownership_maintenance_rules.sql:7` (`numeric(5,2)` — max 2 decimals).

**Worked CHF example (33.33 × 3, boat 55 000):** each owner shows `round(0.3333·55000)=CHF 18 332`; 3 × 18 332 = **CHF 54 996** — CHF 4 of boat value belongs to nobody, while the total badge shows a green check ("Total: 99.99%"). Worse: the 0.1 pp tolerance accepts totals up to 100.09%, i.e. up to **CHF 55** of phantom (or missing) equity on a CHF 55 000 boat presented as "all good". `numeric(5,2)` makes exact thirds structurally impossible; an exit payout computed from these percentages inherits the gap.
**Fix direction:** largest-remainder allocation for the CHF display (shares sum to bootWert by construction) and tolerance ≤ 0.01 pp, or store shares as integer basis points/fractions.

---

### D9 — LOW · Residual two-owner (72.73/27.27) and pre-Jan assumptions

**Where (shipped artifacts, not planning docs):**
- `009_ws3_ownership_maintenance_rules.sql:16-20` seeds ONLY `roger 72.73 / dani 27.27`; **no later migration adds Jan or re-splits to thirds** — the equal-3rd state exists only as hand-edited DB data via `BootPage`/`useEigentuemer`. A fresh environment rebuilt from migrations resurrects the 72.73/27.27 world.
- `009:73-89` seeds Gentleman-Rules stating "Beteiligung zu je 1/2" (rules 2–3) and "für Roger und Dani gedacht" (rule 11) — displayed verbatim by `GentlemanRulesTab`.
- Mitigations found: `lib/fahrer.ts:2` already lists `jan` as active; `BeitraegeGrid.tsx:16-18` correctly starts Jan's beiträge at July 2026. No `72.7`/`27.3` constants exist anywhere in `src/` (grep-verified) — the UI itself is share-agnostic.

**Worked CHF example:** re-running migrations on a clean project shows Roger CHF 40 002 / Dani CHF 14 999 (of 55 000) with no Jan card at all, and the total badge green at 100.00% — a fully self-consistent, fully wrong ownership page.

---

### D10 — LOW · Housekeeping-grade findings

1. **`eingezahlt_von` written on one path only:** `GastsessionTabelle.tsx:237` sets it (`= bezahlt_an`, so it can never record a *different* depositor anyway); `OffenePostenCard.tsx:57` leaves it NULL. Attribution for balances is consistently `bezahlt_an` everywhere (`AbrechnungCard.tsx:44`, `EinnahmenTabelle.tsx:73`), so **no balance is wrong** — but the audit column is unreliable.
2. **Duplicated fee constant:** `jahr <= 2023 ? 300 : 400` lives in both `EinnahmenTabelle.tsx:49` and `BeitraegeGrid.tsx:43`; `abrechnung_config.beitrag_pro_monat` (the DB source of truth, `009:29`) is used by neither → a future fee change silently misclassifies beiträge as "Sonderzahlung".
3. **Non-transactional share save:** `BootPage.tsx:132-140` updates owners sequentially; a mid-loop failure leaves shares summing ≠ 100 with only a toast.
4. **Unbounded queries:** `useKontoberechnung.ts:18-20` selects all rows of three tables with no pagination; PostgREST's default 1000-row cap will silently truncate the saldo once any table passes 1000 rows (~a few seasons of ausgaben). Latent, not yet live.
5. **Editing an `erstattet` expense's payer to 'bootkonto'** (`AusgabeFormDialog.tsx:236-245` doesn't touch `erstattet`) leaves `bezahlt_von='bootkonto' ∧ erstattet=true`. Saldo stays correct (counted once, in the bootkonto branch — the two filter branches at `useKontoberechnung.ts:42,47` are disjoint), but the stale Erstattung News entry survives (trigger `023:7` only reacts to `erstattet` flips).

---

## Reconciliation INVARIANTS (as test assertions)

```ts
// I1 — Saldo identity, integer cents (kills D7)
assert(Number.isInteger(saldoCents))
assert(saldoCents === startsaldoCents + sum(beitraegeCents)
  + sum(gastsessionsCents.filter(s => s.auf_konto_eingezahlt))
  - sum(ausgabenCents.filter(a => a.bezahlt_von === 'bootkonto'))
  - sum(ausgabenCents.filter(a => a.bezahlt_von !== 'bootkonto' && a.erstattet)))

// I2 — Partition: every expense is in exactly ONE bucket (kills double-count/omission)
for (const a of ausgaben) {
  const buckets = [a.bezahlt_von === 'bootkonto',
                   a.bezahlt_von !== 'bootkonto' && a.erstattet,
                   a.bezahlt_von !== 'bootkonto' && !a.erstattet]
  assert(buckets.filter(Boolean).length === 1)
}

// I3 — No payer-less real money (kills D1)
assert(ausgaben.every(a => a.bezahlt_von !== '' || Number(a.betrag) === 0))
assert(ausgaben.every(a => a.verarbeitungs_status !== 'verarbeitung'
       || ageHours(a.erstellt_am) < 24))  // no stuck placeholders

// I4 — Open-items views agree (kills D5): dashboard and Finanzen must use ONE predicate
assert(deepEqual(openItems(OffenePostenCard), openItems(AbrechnungCard)))

// I5 — Anchor immutability (kills D2): flags of rows dated ≤ anchorDate never change
assert(ausgaben.filter(a => a.datum <= ANCHOR_DATE)
       .every(a => a.erstattet === snapshotAtAnchor(a.id).erstattet))
assert(gastsessions.filter(s => s.datum <= ANCHOR_DATE)
       .every(s => s.auf_konto_eingezahlt === snapshotAtAnchor(s.id).auf_konto_eingezahlt))

// I6 — Bank reconciliation (kills D4): latest snapshot matches calculated saldo at its date
assert(Math.abs(saldoCentsAsOf(latestSnapshot.datum) - toCents(latestSnapshot.betrag)) === 0)

// I7 — Deposited money is indestructible via News (kills D3)
assert(cascadeDelete(newsEntryFor(bankedGastsession)).leaves(gastsessionRow).intact)

// I8 — Ownership closes exactly (kills D8/D9)
assert(sum(eigentuemer.map(e => e.anteil_prozent)) === 100.00)  // exact, not ±0.1
assert(sum(ownerChfShares(bootWert)) === bootWert)              // largest-remainder
assert(eigentuemer.length === 3)                                 // Dani, Jan, Roger

// I9 — Deposit attribution is single-keyed
assert(gastsessions.filter(s => s.auf_konto_eingezahlt)
       .every(s => s.eingezahlt_von === null || s.eingezahlt_von === s.bezahlt_an))
```

---

## Explicitly cleared areas (no defect found)

- **Saldo formula double-count:** the `bezahlt_von==='bootkonto'` and `erstattet` branches (`useKontoberechnung.ts:41-48`) are provably disjoint predicates — a `bootkonto ∧ erstattet=true` row is counted exactly once. No expense or session can enter the saldo twice.
- **Open-item ↔ saldo overlap:** an item is in the saldo **iff** its flag is set, and in the open list **iff** it is not — mutually exclusive by construction for post-cutoff items. Marking "erstattet"/"eingezahlt" atomically moves it from one side to the other (single-column update, `OffenePostenCard.tsx:39-51,56-68`).
- **`bezahlt_an` vs `eingezahlt_von` in balance math:** every balance/attribution computation keys on `bezahlt_an` only (`AbrechnungCard.tsx:44`, `EinnahmenTabelle.tsx:73`, `OffenePostenCard.tsx:144`); `eingezahlt_von` is never read → no attribution mismatch can occur today (D10.1 is audit-trail only).
- **SETTLEMENT_CUTOFF comparison mechanics:** ISO-8601 string comparison against a `date` column is order-correct; `<=` matches the stated "created after this date" semantics. No boundary bug found in the comparison itself.
- **`useBeitraege` year window:** `gte('monat', jahr-01-01)`/`lte(jahr-12-31)` (`useBeitraege.ts:8-19`) is inclusive-correct; `useKontoberechnung` deliberately fetches ALL years unfiltered — consistent.
- **Beitrag month keying:** `BeitraegeGrid` reads/writes exact `YYYY-MM-01` strings (`BeitraegeGrid.tsx:26,41`) — no timezone/rounding hazard.
- **Cache invalidation:** every money mutation invalidates `['kontoberechnung']` (`useAusgaben.ts:21-25`, `useGastsessions.ts:21-25`, `useBeitraege.ts:25-30`) — the displayed saldo cannot go stale after in-app edits.
- **`formatCurrency`/`todayISO`** (`format.ts`): locale-safe, timezone-safe (local-date parse at line 1-7); no UTC off-by-one in date display.
- **Changelog triggers vs money:** all 019/021/023 triggers only write `changelog` text — none mutates `betrag`/flags; the only money-touching DB routine is `delete_changelog_cascade` (reported as D3). Migrations 026/027 are text/label-only.
- **`erstattungen` changelog delete-loop (023):** un-marking removes exactly its own `quelle_typ='erstattung'` row; expense delete removes both entries — no orphan or double News-driven state found.

---

## Summary

| Severity | Count | IDs |
|---|---|---|
| HIGH | 3 | D1 orphaned scan rows, D2 anchor double-count, D3 News-delete destroys banked money |
| MEDIUM | 5 | D4 unreconciled snapshots, D5 view disagreement, D6 mixed-basis "Saldo", D7 float CHF, D8 share rounding |
| LOW | 2 | D9 two-owner migration residue, D10 housekeeping (5 items) |

**Canonical balance source (one-way-door): calculated saldo, with `kontostand_snapshots` kept strictly as bank-reconciliation checkpoints surfacing a delta.** See D4 for rationale.
