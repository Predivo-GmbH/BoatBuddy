-- 032_a_drained_engine_hours_total_is_repaired.sql :: repair boot_stats.gesamtstunden after the
-- staging integration suite drained it below zero (2026-10-02).
--
-- THE DEFECT. tests/integration/critical-paths.test.ts inserted its probe nutzungslog DIRECTLY into
-- the table. Only create_nutzungslog_atomic (the app's own path, src/hooks/useNutzungslogs.ts) adds
-- a log's hours onto the boot_stats singleton, so that insert added nothing. But every DELETE of a
-- nutzungslog fires on_nutzungslog_delete (migration 022), which subtracts old.betriebsstunden. The
-- suite deletes its own rows in afterAll (and a killed run's rows in its orphan sweep), so each run
-- took 2.5h off staging's total. It reached -5.5 and the suite's own tripwire
-- (gesamtstunden >= 0, "Boot Stats > singleton row is present and readable") failed deploy-staging
-- on every push (run 36948119189) and then the nightly gate-integration at -8 (run 36966096917).
--
-- Engine hours cannot be negative. The drained value is corrupt; the hours it lost were never real
-- trips, they were the suite's own probe rows, so the repair target is 0 - PLUS the hours of any
-- probe rows ('[itest]' in notiz, see MARKER in the suite) still present at the moment this runs.
-- Those rows will still be deleted by their run's afterAll or by a later orphan sweep, and each
-- delete subtracts its hours again. Counting them in makes the value land on exactly 0 once they
-- are gone, instead of on a fresh negative:
--   * on every push, test.yml runs the same suite against staging IN THE SAME SECOND as
--     deploy-staging (both started 00:51:58Z in run 36948119189 / 36948119191), so a probe row
--     can be in flight while this UPDATE runs;
--   * a probe row inserted directly before this fix was never counted, and the sweep would
--     subtract it later.
--
-- Production: the WHERE clause makes this a no-op wherever gesamtstunden is not negative, and the
-- suite never writes to production, so no '[itest]' row exists there.
--
-- Two companion changes land in the SAME commit, because none of the three works alone:
--   * the suite creates its probe log through create_nutzungslog_atomic, so the add and the
--     trigger's subtract pair up and the drain stops;
--   * deploy-staging applies migrations BEFORE unit tests (.github/workflows/deploy.yml). Before,
--     the failing test sat in front of the migration step, so this repair could never reach
--     staging.
--
-- Deliberately NOT a CHECK (gesamtstunden >= 0): the suite's delete and the app's own edits are
-- separate statements from the matching add, and a CHECK would turn a correct, momentarily low
-- value into a failed write. The suite's assertion stays the tripwire.

update public.boot_stats
set gesamtstunden = (
      select coalesce(sum(n.betriebsstunden), 0)
      from public.nutzungslogs n
      where n.notiz like '[itest]%'
    ),
    aktualisiert_am = now()
where gesamtstunden < 0;

-- Prove the repair in the same migration. A repair that silently repaired nothing is how this
-- drift would come back unnoticed.
do $$
begin
  if exists (select 1 from public.boot_stats where gesamtstunden < 0) then
    raise exception '032: boot_stats.gesamtstunden is still negative after the repair';
  end if;
end $$;
