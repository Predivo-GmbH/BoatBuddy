-- 023: Reimbursements (Erstattung) are money events -> log them to Neuigkeiten.
-- When a private expense is marked reimbursed (the Bootkonto pays the person back),
-- add a News entry; if it's un-marked, remove it again.

create or replace function log_ausgabe_erstattung() returns trigger as $$
begin
  if coalesce(old.erstattet,false) = false and new.erstattet = true and new.bezahlt_von <> 'bootkonto' and new.bezahlt_von <> '' then
    insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
    values (
      'Erstattung an ' || initcap(new.bezahlt_von) || ': CHF ' || new.betrag::text,
      'daten',
      coalesce(new.erstattet_am, current_date),
      'Rückzahlung vom Bootkonto für: ' || new.bezeichnung,
      now(), 'erstattung', new.id
    );
  elsif coalesce(old.erstattet,false) = true and new.erstattet = false then
    delete from public.changelog where quelle_typ = 'erstattung' and quelle_id = new.id;
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists log_ausgabe_erstattung_trigger on public.ausgaben;
create trigger log_ausgabe_erstattung_trigger after update on public.ausgaben for each row execute function log_ausgabe_erstattung();

-- Deleting an expense must also remove BOTH its own News entry and its Erstattung entry
create or replace function on_ausgaben_delete_changelog() returns trigger as $$
begin
  delete from public.changelog where quelle_id = old.id and quelle_typ in ('ausgabe','erstattung');
  return old;
end; $$ language plpgsql;
drop trigger if exists on_ausgaben_delete_trigger on public.ausgaben;
create trigger on_ausgaben_delete_trigger after delete on public.ausgaben for each row execute function on_ausgaben_delete_changelog();

-- Deleting an Erstattung News entry should UNDO the reimbursement (not delete the expense)
create or replace function delete_changelog_cascade(p_id uuid) returns void as $$
declare v_typ text; v_qid uuid;
begin
  select quelle_typ, quelle_id into v_typ, v_qid from public.changelog where id = p_id;
  if v_qid is not null then
    if    v_typ = 'nutzungslog'  then delete from public.nutzungslogs where id = v_qid;
    elsif v_typ = 'ausgabe'      then delete from public.ausgaben where id = v_qid;
    elsif v_typ = 'erstattung'   then update public.ausgaben set erstattet = false, erstattet_am = null where id = v_qid;
    elsif v_typ = 'reservierung' then delete from public.reservierungen where id = v_qid;
    elsif v_typ = 'gastsession'  then delete from public.gastsessions where id = v_qid;
    elsif v_typ = 'beitrag'      then delete from public.beitraege where id = v_qid;
    elsif v_typ = 'ferien'       then delete from public.ferien where id = v_qid;
    elsif v_typ = 'kontostand'   then delete from public.kontostand_snapshots where id = v_qid;
    end if;
  end if;
  delete from public.changelog where id = p_id; -- cleanup (no-op if a trigger already removed it)
end; $$ language plpgsql security definer;

grant execute on function delete_changelog_cascade(uuid) to anon;
