-- 022: Link each auto-logged Neuigkeiten (changelog) entry to its source record and
-- couple deletes both ways:
--   * delete a source row (trip, expense, reservation, guest, …) -> its News entry goes
--   * delete a News entry -> its source row goes (delete_changelog_cascade)
-- Also moves the boot_stats adjustment for trip deletes into an AFTER DELETE trigger so
-- EVERY delete path (RPC, direct, cascade) keeps the hours correct.

-- 1. Source link columns on changelog (null for manually added news)
alter table public.changelog add column if not exists quelle_typ text;
alter table public.changelog add column if not exists quelle_id uuid;

-- 2. Re-create the auto-log insert triggers so they record quelle_typ + quelle_id

create or replace function log_ferien_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
  values ('Dani Urlaub: ' || format_date_range_de(new.von_datum, new.bis_datum), 'daten', new.von_datum, new.notiz, now(), 'ferien', new.id);
  return new;
end; $$ language plpgsql;

create or replace function log_reservierungen_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
  values ('Reservierung: ' || initcap(new.fahrer) || ' am ' || format_date_de(new.datum), 'daten', new.datum, new.notiz, now(), 'reservierung', new.id);
  return new;
end; $$ language plpgsql;

create or replace function log_ausgaben_insert() returns trigger as $$
begin
  if new.verarbeitungs_status = 'verarbeitung' then
    return new; -- placeholder upload; logged later once extraction finishes
  end if;
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
  values ('Ausgabe: ' || new.bezeichnung || ' - CHF ' || new.betrag::text, 'daten', new.datum, new.notiz, now(), 'ausgabe', new.id);
  return new;
end; $$ language plpgsql;

create or replace function log_ausgaben_extracted() returns trigger as $$
begin
  if old.verarbeitungs_status = 'verarbeitung' and new.verarbeitungs_status = 'fertig' then
    insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
    values ('Ausgabe: ' || new.bezeichnung || ' - CHF ' || new.betrag::text, 'daten', new.datum, new.notiz, now(), 'ausgabe', new.id);
  end if;
  return new;
end; $$ language plpgsql;

create or replace function log_gastsessions_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
  values ('Gastsession: ' || new.gast_name || ' (CHF ' || new.betrag::text || ')', 'daten', new.datum, new.notiz, now(), 'gastsession', new.id);
  return new;
end; $$ language plpgsql;

create or replace function log_nutzungslogs_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
  values (
    'Betriebsstunden: ' || new.betriebsstunden::text || 'h, Treibstoff: ' || coalesce(new.treibstoff_liter::text || 'L', 'n.a.'),
    'daten', new.datum,
    'Fahrer: ' || initcap(new.fahrer) || (case when new.notiz is not null then ' - ' || new.notiz else '' end),
    now(), 'nutzungslog', new.id);
  return new;
end; $$ language plpgsql;

create or replace function log_beitraege_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
  values ('Beitrag: ' || initcap(new.fahrer) || ' - CHF ' || new.betrag::text, 'daten', new.monat, new.notiz, now(), 'beitrag', new.id);
  return new;
end; $$ language plpgsql;

create or replace function log_kontostand_snapshots_insert() returns trigger as $$
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
  values ('Kontostand: CHF ' || new.betrag::text, 'daten', new.datum, new.notiz, now(), 'kontostand', new.id);
  return new;
end; $$ language plpgsql;

-- 3. Source-delete -> remove the linked News entry (+ adjust boot_stats for trips)

create or replace function on_nutzungslog_delete() returns trigger as $$
begin
  update public.boot_stats set gesamtstunden = gesamtstunden - old.betriebsstunden where id = (select id from public.boot_stats limit 1);
  delete from public.changelog where quelle_typ = 'nutzungslog' and quelle_id = old.id;
  return old;
end; $$ language plpgsql;
drop trigger if exists on_nutzungslog_delete_trigger on public.nutzungslogs;
create trigger on_nutzungslog_delete_trigger after delete on public.nutzungslogs for each row execute function on_nutzungslog_delete();

create or replace function on_source_delete_changelog() returns trigger as $$
begin
  delete from public.changelog where quelle_typ = tg_argv[0] and quelle_id = old.id;
  return old;
end; $$ language plpgsql;

drop trigger if exists on_ausgaben_delete_trigger on public.ausgaben;
create trigger on_ausgaben_delete_trigger after delete on public.ausgaben for each row execute function on_source_delete_changelog('ausgabe');
drop trigger if exists on_reservierungen_delete_trigger on public.reservierungen;
create trigger on_reservierungen_delete_trigger after delete on public.reservierungen for each row execute function on_source_delete_changelog('reservierung');
drop trigger if exists on_gastsessions_delete_trigger on public.gastsessions;
create trigger on_gastsessions_delete_trigger after delete on public.gastsessions for each row execute function on_source_delete_changelog('gastsession');
drop trigger if exists on_beitraege_delete_trigger on public.beitraege;
create trigger on_beitraege_delete_trigger after delete on public.beitraege for each row execute function on_source_delete_changelog('beitrag');
drop trigger if exists on_ferien_delete_trigger on public.ferien;
create trigger on_ferien_delete_trigger after delete on public.ferien for each row execute function on_source_delete_changelog('ferien');
drop trigger if exists on_kontostand_snapshots_delete_trigger on public.kontostand_snapshots;
create trigger on_kontostand_snapshots_delete_trigger after delete on public.kontostand_snapshots for each row execute function on_source_delete_changelog('kontostand');

-- 4. boot_stats is now adjusted by the trigger above, so the atomic delete just deletes
create or replace function delete_nutzungslog_atomic(p_id uuid) returns void as $$
begin
  delete from public.nutzungslogs where id = p_id;
end; $$ language plpgsql security definer;

-- 5. Delete a News entry -> delete its source row (which cascades back to the News entry)
create or replace function delete_changelog_cascade(p_id uuid) returns void as $$
declare v_typ text; v_qid uuid;
begin
  select quelle_typ, quelle_id into v_typ, v_qid from public.changelog where id = p_id;
  if v_qid is not null then
    if    v_typ = 'nutzungslog'  then delete from public.nutzungslogs where id = v_qid;
    elsif v_typ = 'ausgabe'      then delete from public.ausgaben where id = v_qid;
    elsif v_typ = 'reservierung' then delete from public.reservierungen where id = v_qid;
    elsif v_typ = 'gastsession'  then delete from public.gastsessions where id = v_qid;
    elsif v_typ = 'beitrag'      then delete from public.beitraege where id = v_qid;
    elsif v_typ = 'ferien'       then delete from public.ferien where id = v_qid;
    elsif v_typ = 'kontostand'   then delete from public.kontostand_snapshots where id = v_qid;
    end if;
  end if;
  delete from public.changelog where id = p_id; -- cleanup (no-op if the source trigger already removed it)
end; $$ language plpgsql security definer;

grant execute on function delete_changelog_cascade(uuid) to anon;
