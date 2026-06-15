-- 024: Fuel is no longer logged per trip (single source = treibstoff expenses).
-- Drop the "Treibstoff: …" part from the trip changelog title.

create or replace function log_nutzungslogs_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
  values (
    'Betriebsstunden: ' || new.betriebsstunden::text || 'h',
    'daten', new.datum,
    'Fahrer: ' || initcap(new.fahrer) || (case when new.notiz is not null then ' - ' || new.notiz else '' end),
    now(), 'nutzungslog', new.id);
  return new;
end; $$ language plpgsql;

-- Tidy existing trip entries
update public.changelog
set titel = regexp_replace(titel, ',\s*Treibstoff:.*$', '')
where quelle_typ = 'nutzungslog' and titel like '%Treibstoff:%';
