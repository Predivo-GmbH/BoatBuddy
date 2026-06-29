-- Fix: ferien changelog trigger was hardcoding 'Dani' instead of using NEW.fahrer
-- This caused all vacation entries to appear as "Dani Urlaub" in Neuigkeiten regardless of who was selected

-- 1. Fix the trigger function to use the actual fahrer value
create or replace function log_ferien_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  values (
    initcap(new.fahrer) || ' Urlaub: ' || format_date_range_de(new.von_datum, new.bis_datum),
    'daten',
    new.von_datum,
    new.notiz,
    now()
  );
  return new;
end;
$$ language plpgsql;

-- 2. Correct the 5 wrong changelog entries created on 2026-06-23 that say "Dani Urlaub"
--    but correspond to Roger's vacations (ferien table has fahrer='roger' for these)
-- 2. Correct the 5 wrong changelog entries created on 2026-06-23 that say "Dani Urlaub"
--    but correspond to Roger's vacations (ferien table has fahrer='roger' for these)
UPDATE public.changelog SET titel = 'Roger Urlaub: 27.' || chr(8211) || '27. Juni' WHERE id = '249227a0-ee0a-45c1-9654-9d1da80681bb';
UPDATE public.changelog SET titel = 'Roger Urlaub: 05.' || chr(8211) || '05. Juli' WHERE id = 'f93a4930-e56e-4975-955a-851c750a5145';
UPDATE public.changelog SET titel = 'Roger Urlaub: 10.' || chr(8211) || '12. Juli' WHERE id = 'a8a67bf3-68b5-481b-ace0-29f2155fb2ac';
UPDATE public.changelog SET titel = 'Roger Urlaub: 22.' || chr(8211) || '22. August' WHERE id = '8016dcf7-77b4-49e3-9c22-7e674ecf711d';
UPDATE public.changelog SET titel = 'Roger Urlaub: 12.' || chr(8211) || '12. September' WHERE id = '68691d32-d7e7-4d8f-8eca-666d44923716';
