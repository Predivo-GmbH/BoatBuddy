-- 026: Permanent fix for recurring Umlaut mojibake (R[ue]ckzahlung / f[ue]r / M[ae]rz).
-- Root cause: the German string LITERALS inside these functions were re-encoded
-- (UTF-8 -> Windows-1252) when earlier migrations were applied THROUGH A TOOL, so
-- the corruption lived in the stored function bodies and every trigger fire
-- regenerated fresh mojibake in the changelog rows.
--
-- Durable fix: this file contains NO non-ASCII bytes at all. Every accented
-- character is produced at runtime by chr(<unicode-codepoint>), which in a UTF-8
-- database yields the correct character. The file therefore cannot be mojibaked
-- in transit no matter how it is applied (curl / psql / PowerShell).
--   chr(228)=a-umlaut   chr(252)=u-umlaut   chr(8211)=en-dash
--   (mojibake signatures: chr(195)=A-tilde, chr(226)=a-circumflex)

-- format_date_de: only the March label contains a non-ASCII char.
create or replace function format_date_de(d date) returns text as $$
  select case extract(month from d)::int
    when 1 then to_char(d, 'DD') || '. Januar'
    when 2 then to_char(d, 'DD') || '. Februar'
    when 3 then to_char(d, 'DD') || '. M' || chr(228) || 'rz'
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

-- format_date_range_de: en-dash separator + March label.
create or replace function format_date_range_de(from_date date, to_date date) returns text as $$
  select
    to_char(from_date, 'DD') || '.' || chr(8211) ||
    to_char(to_date, 'DD') || '. ' ||
    case extract(month from to_date)::int
      when 1 then 'Januar'
      when 2 then 'Februar'
      when 3 then 'M' || chr(228) || 'rz'
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

-- log_ausgabe_erstattung: "R[ue]ckzahlung vom Bootkonto f[ue]r".
create or replace function log_ausgabe_erstattung() returns trigger as $$
begin
  if coalesce(old.erstattet,false) = false and new.erstattet = true and new.bezahlt_von <> 'bootkonto' and new.bezahlt_von <> '' then
    insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am, quelle_typ, quelle_id)
    values (
      'Erstattung an ' || initcap(new.bezahlt_von) || ': CHF ' || new.betrag::text,
      'daten',
      coalesce(new.erstattet_am, current_date),
      'R' || chr(252) || 'ckzahlung vom Bootkonto f' || chr(252) || 'r: ' || new.bezeichnung,
      now(), 'erstattung', new.id
    );
  elsif coalesce(old.erstattet,false) = true and new.erstattet = false then
    delete from public.changelog where quelle_typ = 'erstattung' and quelle_id = new.id;
  end if;
  return new;
end; $$ language plpgsql;

-- Repair any rows already corrupted by the old function bodies. WIN1252 reverses
-- the en-dash / smart-quote byte range that strict LATIN1 cannot. Filtered to
-- matching rows only -- never double-reverse a correct umlaut.
update public.changelog
  set titel = convert_from(convert_to(titel,'WIN1252'),'UTF8')
  where titel like '%' || chr(195) || '%' or titel like '%' || chr(226) || '%';
update public.changelog
  set beschreibung = convert_from(convert_to(beschreibung,'WIN1252'),'UTF8')
  where beschreibung like '%' || chr(195) || '%' or beschreibung like '%' || chr(226) || '%';
