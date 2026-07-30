-- Allow multiple time-slot reservations per driver per day, but forbid OVERLAPS.
-- Before: `unique (datum, fahrer)` (003) limited each driver to ONE reservation per day.
-- After : a driver may hold several non-overlapping slots on the same day.
--
-- Overlap is enforced per (fahrer) via a GiST exclusion constraint over the
-- reservation's time range. Back-to-back slots (e.g. 10:00-13:00 and 13:00-16:00)
-- are allowed because tsrange defaults to '[)' bounds. Whole-day reservations
-- (ganzer_tag = true, von_zeit/bis_zeit NULL) occupy the full calendar day.

-- Needed so `fahrer WITH =` (btree equality) can participate in a GiST index.
create extension if not exists btree_gist;

-- 1. Drop the old one-per-day unique constraint (whatever its generated name is).
do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.reservierungen'::regclass
    and contype = 'u';
  if c is not null then
    execute format('alter table public.reservierungen drop constraint %I', c);
  end if;
end $$;

-- 2. Forbid overlapping slots for the same driver.
--    Range end handles three cases:
--      - whole day (bis_zeit NULL)      -> ends next midnight
--      - crosses midnight (bis <= von)  -> roll end into next day
--      - normal slot                    -> datum + bis_zeit
alter table public.reservierungen
  add constraint reservierungen_no_overlap
  exclude using gist (
    fahrer with =,
    tsrange(
      datum + coalesce(von_zeit, time '00:00'),
      case
        when bis_zeit is null then (datum + 1)::timestamp
        when bis_zeit <= coalesce(von_zeit, time '00:00') then datum + bis_zeit + interval '1 day'
        else datum + bis_zeit
      end
    ) with &&
  );
