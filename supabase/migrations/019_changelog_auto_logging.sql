-- Auto-log all manual entries to changelog

-- Helper function to format date in German
create or replace function format_date_de(d date) returns text as $$
  select case extract(month from d)::int
    when 1 then to_char(d, 'DD') || '. Januar'
    when 2 then to_char(d, 'DD') || '. Februar'
    when 3 then to_char(d, 'DD') || '. März'
    when 4 then to_char(d, 'DD') || '. April'
    when 5 then to_char(d, 'DD') || '. Mai'
    when 6 then to_char(d, 'DD') || '. Juni'
    when 7 then to_char(d, 'DD') || '. Juli'
    when 8 then to_char(d, 'DD') || '. August'
    when 9 then to_char(d, 'DD') || '. September'
    when 10 then to_char(d, 'DD') || '. Oktober'
    when 11 then to_char(d, 'DD') || '. November'
    when 12 then to_char(d, 'DD') || '. Dezember'
  end || ' ' || extract(year from d)::text
$$ language sql immutable;

-- Helper function to format date range in German (for vacations)
create or replace function format_date_range_de(from_date date, to_date date) returns text as $$
  select
    to_char(from_date, 'DD') || '.–' ||
    to_char(to_date, 'DD') || '. ' ||
    case extract(month from to_date)::int
      when 1 then 'Januar'
      when 2 then 'Februar'
      when 3 then 'März'
      when 4 then 'April'
      when 5 then 'Mai'
      when 6 then 'Juni'
      when 7 then 'Juli'
      when 8 then 'August'
      when 9 then 'September'
      when 10 then 'Oktober'
      when 11 then 'November'
      when 12 then 'Dezember'
    end
$$ language sql immutable;

-- Trigger: ferien (vacations)
create or replace function log_ferien_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  values (
    'Dani Urlaub: ' || format_date_range_de(new.von_datum, new.bis_datum),
    'daten',
    new.von_datum,
    new.notiz,
    now()
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists log_ferien_insert_trigger on public.ferien;
create trigger log_ferien_insert_trigger after insert on public.ferien
  for each row execute function log_ferien_insert();

-- Trigger: reservierungen (reservations)
create or replace function log_reservierungen_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  values (
    'Reservierung: ' || new.fahrer || ' am ' || format_date_de(new.datum),
    'daten',
    new.datum,
    new.notiz,
    now()
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists log_reservierungen_insert_trigger on public.reservierungen;
create trigger log_reservierungen_insert_trigger after insert on public.reservierungen
  for each row execute function log_reservierungen_insert();

-- Trigger: ausgaben (expenses)
create or replace function log_ausgaben_insert() returns trigger as $$
begin
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

drop trigger if exists log_ausgaben_insert_trigger on public.ausgaben;
create trigger log_ausgaben_insert_trigger after insert on public.ausgaben
  for each row execute function log_ausgaben_insert();

-- Trigger: gastsessions (guest sessions)
create or replace function log_gastsessions_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  values (
    'Gastsession: ' || new.gast_name || ' (CHF ' || new.betrag::text || ')',
    'daten',
    new.datum,
    new.notiz,
    now()
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists log_gastsessions_insert_trigger on public.gastsessions;
create trigger log_gastsessions_insert_trigger after insert on public.gastsessions
  for each row execute function log_gastsessions_insert();

-- Trigger: nutzungslogs (usage logs)
create or replace function log_nutzungslogs_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  values (
    'Betriebsstunden: ' || new.betriebsstunden::text || 'h, Treibstoff: ' || coalesce(new.treibstoff_liter::text || 'L', 'n.a.'),
    'daten',
    new.datum,
    'Fahrer: ' || new.fahrer || (case when new.notiz is not null then ' - ' || new.notiz else '' end),
    now()
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists log_nutzungslogs_insert_trigger on public.nutzungslogs;
create trigger log_nutzungslogs_insert_trigger after insert on public.nutzungslogs
  for each row execute function log_nutzungslogs_insert();

-- Trigger: beitraege (contributions/membership fees)
create or replace function log_beitraege_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  values (
    'Beitrag: ' || new.fahrer || ' - CHF ' || new.betrag::text,
    'daten',
    new.monat,
    new.notiz,
    now()
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists log_beitraege_insert_trigger on public.beitraege;
create trigger log_beitraege_insert_trigger after insert on public.beitraege
  for each row execute function log_beitraege_insert();

-- Trigger: kontostand_snapshots (account balance)
create or replace function log_kontostand_snapshots_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  values (
    'Kontostand: CHF ' || new.betrag::text,
    'daten',
    new.datum,
    new.notiz,
    now()
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists log_kontostand_snapshots_insert_trigger on public.kontostand_snapshots;
create trigger log_kontostand_snapshots_insert_trigger after insert on public.kontostand_snapshots
  for each row execute function log_kontostand_snapshots_insert();
