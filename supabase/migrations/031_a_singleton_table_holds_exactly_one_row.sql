-- 031_a_singleton_table_holds_exactly_one_row.sql :: make the one-row tables actually hold one row
-- (2026-09-01).
--
-- THE DEFECT. `boot_stats` and `abrechnung_config` are singletons by CONVENTION only. Each was
-- created with a `uuid primary key default gen_random_uuid()` and seeded with exactly one row, and
-- nothing anywhere says there may only ever be one. The app then reads them with
-- `.limit(1).maybeSingle()` and NO ORDER BY:
--
--   src/hooks/useBootStats.ts:11-15        boot_stats          -> then UPDATEs .eq('id', stats.id)
--   src/hooks/useAbrechnung.ts:11-15       abrechnung_config   -> then UPDATEs .eq('id', config.id)
--   src/hooks/useKontoberechnung.ts:21     boot_stats.startsaldo
--
-- `limit(1)` with no ordering returns whatever row the database finds first. With one row that is
-- always the same row and the bug is invisible. With two it is arbitrary, it can differ between two
-- queries in the SAME page load - useBootStats and useKontoberechnung read the same table
-- independently - and the row the user is shown is then also the row the app writes back to. So the
-- failure is not "a wrong number appears": it is the settings screen editing a row the user was
-- never looking at.
--
-- THIS IS NOT HYPOTHETICAL. Both tables carry
-- `create policy "anon_all" ... for all to anon using (true) with check (true)`, and BoatBuddy's
-- anon key ships inside the browser bundle. A second row is one INSERT away from anyone who opens
-- devtools, and the app has no login to sit in front of it. The integration suite already documents
-- the hazard in `tests/integration/critical-paths.test.ts:319-338`, where the "Boot Stats" block is
-- deliberately READ-ONLY because inserting a probe row would move the account balance on /finanzen
-- for every concurrent reader, including the E2E gate.
--
-- THE FIX IS THE CONSTRAINT, NOT THE ORDER BY. Ordering makes the app pick the same wrong row every
-- time; only the database can make a second row impossible. `unique ((true))` is the standard
-- single-row idiom: the index has one possible key, so a second INSERT is rejected by the database
-- rather than by hope. The ORDER BY still goes in (in the same commit) as the belt to this braces -
-- it is what protects a developer's local database, which no migration has reached yet.
--
-- IT REFUSES RATHER THAN CHOOSING. If a table already holds more than one row, this migration
-- raises and names the rows instead of creating the index. Deleting a row here would be picking
-- which of the owners' real numbers to destroy, on a boat three people share, with no way to tell
-- which is which - exactly the decision a migration must never make silently. A refused deploy is
-- recoverable; a deleted `startsaldo` is not.
--
-- Idempotent: `if not exists` on both indexes, and the guard is a no-op once each table holds one
-- row.

do $$
declare
  t           text;
  n           bigint;
  ids         text;
begin
  foreach t in array array['boot_stats', 'abrechnung_config'] loop
    execute format('select count(*) from public.%I', t) into n;

    if n = 0 then
      -- A missing seed row is a different fault and is NOT silently seeded here: inventing a
      -- boat's opening balance is not a migration's business.
      raise exception '031: public.% holds 0 rows. It is seeded by its creating migration '
                      '(006 / 009); a table with no row means that seed was lost. Restore the row '
                      'before adding the single-row constraint.', t;
    end if;

    if n > 1 then
      execute format('select string_agg(id::text, '', '' order by aktualisiert_am) from public.%I', t) into ids;
      raise exception '031: public.% already holds % rows (%). The app reads this table with '
                      'limit(1) and no ORDER BY, so it has been showing - and writing back to - an '
                      'arbitrary one of them. This migration will not choose which to delete: on a '
                      'boat three owners share, that is picking whose numbers to destroy. Decide '
                      'which row is authoritative, delete the others by id, then re-run.',
                      t, n, ids;
    end if;
  end loop;
end $$;

-- One possible key, therefore at most one row. Named so a failure reads as what it is.
create unique index if not exists boot_stats_is_a_singleton
  on public.boot_stats ((true));

create unique index if not exists abrechnung_config_is_a_singleton
  on public.abrechnung_config ((true));

comment on index public.boot_stats_is_a_singleton is
  'boot_stats holds exactly one row. The app reads it with limit(1) and updates by the id it read '
  'back, so a second row would let the settings screen edit a row nobody was looking at. Added by '
  'migration 031 (2026-09-01).';

comment on index public.abrechnung_config_is_a_singleton is
  'abrechnung_config holds exactly one row - same reason as boot_stats_is_a_singleton. Added by '
  'migration 031 (2026-09-01).';

-- Receipts, checked rather than claimed.
do $$
declare
  missing text;
begin
  select string_agg(x.want, ', ')
    into missing
    from (values ('boot_stats_is_a_singleton'), ('abrechnung_config_is_a_singleton')) as x(want)
   where not exists (
     select 1 from pg_indexes
      where schemaname = 'public' and indexname = x.want
   );

  if missing is not null then
    raise exception '031: index(es) missing after apply: %', missing;
  end if;

  raise notice '031 DONE: boot_stats and abrechnung_config can each hold at most one row.';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
--   drop index if exists public.boot_stats_is_a_singleton;
--   drop index if exists public.abrechnung_config_is_a_singleton;
-- Only needed if either table ever legitimately becomes multi-row (e.g. a second boat). At that
-- point the three reads listed at the top stop being singleton reads and need a real key, not just
-- an ORDER BY - dropping the index without doing that work restores the original defect.
