-- Optionally link a trip log (nutzungslog) to the reservation slot it fulfilled.
-- Now that a driver can hold several non-overlapping slots per day (mig 028),
-- this lets a logged trip record WHICH planned session it corresponds to,
-- enabling planned-vs-actual reporting per session. Purely optional (nullable);
-- unlinked logs behave exactly as before.

-- 1. Nullable FK. ON DELETE SET NULL so deleting a reservation never deletes the
--    usage record — it just drops the link.
alter table public.nutzungslogs
  add column if not exists reservierung_id uuid
    references public.reservierungen(id) on delete set null;

create index if not exists idx_nutzungslogs_reservierung
  on public.nutzungslogs(reservierung_id);

-- 2. Recreate the atomic create RPC with the new optional p_reservierung_id.
--    Drop the old 8-arg signature first so the added defaulted arg can't create
--    an overload-resolution ambiguity. (Note: staging was missing this function
--    entirely — this also repairs that drift.)
drop function if exists public.create_nutzungslog_atomic(
  date, text, numeric, numeric, jsonb, text, jsonb, numeric
);

create or replace function create_nutzungslog_atomic(
  p_datum date,
  p_fahrer text,
  p_betriebsstunden numeric,
  p_treibstoff_liter numeric default null,
  p_aktivitaeten jsonb default '[]'::jsonb,
  p_notiz text default null,
  p_teilnehmer jsonb default '[]'::jsonb,
  p_neue_gesamtstunden numeric default null,
  p_reservierung_id uuid default null
) returns uuid as $$
declare
  v_id uuid;
  v_teilnehmer text[];
begin
  -- Pass raw jsonb arrays (see hook): jsonb_array_elements_text needs an array,
  -- a stringified '[]' arrives as a scalar and throws 22023.
  select coalesce(array_agg(elem::text), '{}')
  into v_teilnehmer
  from jsonb_array_elements_text(p_teilnehmer) as elem;

  insert into nutzungslogs (datum, fahrer, betriebsstunden, treibstoff_liter, aktivitaeten, notiz, teilnehmer, reservierung_id)
  values (p_datum, p_fahrer, p_betriebsstunden, p_treibstoff_liter, p_aktivitaeten, p_notiz, v_teilnehmer, p_reservierung_id)
  returning id into v_id;

  if p_neue_gesamtstunden is not null then
    update boot_stats set gesamtstunden = p_neue_gesamtstunden where id = (select id from boot_stats limit 1);
  else
    update boot_stats set gesamtstunden = gesamtstunden + p_betriebsstunden where id = (select id from boot_stats limit 1);
  end if;

  return v_id;
end;
$$ language plpgsql security definer;

grant execute on function create_nutzungslog_atomic(
  date, text, numeric, numeric, jsonb, text, jsonb, numeric, uuid
) to anon;
