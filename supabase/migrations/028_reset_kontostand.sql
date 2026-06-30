-- 028: Account/season reset as a first-class, atomic, audited operation.
-- Replaces the break-glass "hand-edit boot_stats.startsaldo via SQL" workflow with a
-- single RPC that (1) computes the startsaldo anchor needed to make the calculated
-- Kontostand equal the desired target, (2) writes it, and (3) logs a News entry —
-- all in one transaction, server-side (so accented text can't be mojibaked in transit).
--
-- Kontostand model (mirrors src/hooks/useKontoberechnung.ts):
--   saldo = startsaldo + beitraege + gastsessions(eingezahlt)
--           - ausgaben(bezahlt_von='bootkonto') - erstattungen
-- To hit a target T:  new_startsaldo = T - (saldo_components without startsaldo)
--
-- ASCII-only file: the German "u-umlaut" is produced at runtime via chr(252) so the
-- stored function body cannot be corrupted no matter how this migration is applied.

create or replace function reset_kontostand(p_target numeric, p_note text default null)
returns numeric as $$
declare
  v_components numeric;
  v_new_start  numeric;
begin
  if p_target is null then
    raise exception 'Zielbetrag fehlt';
  end if;

  select
      coalesce((select sum(betrag) from public.beitraege), 0)
    + coalesce((select sum(betrag) from public.gastsessions where auf_konto_eingezahlt), 0)
    - coalesce((select sum(betrag) from public.ausgaben where bezahlt_von = 'bootkonto'), 0)
    - coalesce((select sum(betrag) from public.ausgaben where bezahlt_von <> 'bootkonto' and erstattet), 0)
  into v_components;

  v_new_start := round(p_target - v_components, 2);

  update public.boot_stats
    set startsaldo = v_new_start
  where id = (select id from public.boot_stats order by aktualisiert_am limit 1);

  insert into public.changelog (titel, kategorie, datum, beschreibung)
  values (
    'Kontostand zur' || chr(252) || 'ckgesetzt auf CHF ' || trim(to_char(round(p_target, 2), 'FM999999990.00')),
    'daten',
    current_date,
    p_note
  );

  return v_new_start;
end;
$$ language plpgsql security definer;

grant execute on function reset_kontostand(numeric, text) to anon;
