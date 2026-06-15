-- 021: Regenerate the Neuigkeiten (changelog) entry for phone-photo expenses
-- AFTER AI extraction completes, instead of logging the "Handy-Foto" placeholder.
--
-- Phone-photo uploads insert a placeholder ausgaben row (bezeichnung 'Handy-Foto',
-- betrag 0, verarbeitungs_status 'verarbeitung'); extract-expense then fills in the
-- real values and flips the status to 'fertig'. The old insert trigger logged the
-- placeholder, so Neuigkeiten was stuck on "Ausgabe: Handy-Foto - CHF 0.00".

-- 1. Skip logging the placeholder at insert time (manual expenses have a NULL
--    status, so they still log immediately as before).
create or replace function log_ausgaben_insert() returns trigger as $$
begin
  if new.verarbeitungs_status = 'verarbeitung' then
    return new;  -- placeholder upload; logged later once extraction finishes
  end if;
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  values (
    'Ausgabe: ' || new.bezeichnung || ' - CHF ' || new.betrag::text,
    'daten',
    new.datum,
    new.notiz,
    now()
  );
  return new;
end;
$$ language plpgsql;

-- 2. Log (regenerate) the entry once extraction transitions the row to 'fertig'.
create or replace function log_ausgaben_extracted() returns trigger as $$
begin
  if old.verarbeitungs_status = 'verarbeitung'
     and new.verarbeitungs_status = 'fertig' then
    insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
    values (
      'Ausgabe: ' || new.bezeichnung || ' - CHF ' || new.betrag::text,
      'daten',
      new.datum,
      new.notiz,
      now()
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists log_ausgaben_extracted_trigger on public.ausgaben;
create trigger log_ausgaben_extracted_trigger after update on public.ausgaben
  for each row execute function log_ausgaben_extracted();
