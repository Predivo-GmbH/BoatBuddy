-- Backfill all existing reservierungen into changelog
do $$
declare
  v_count int := 0;
begin
  insert into public.changelog (titel, kategorie, datum, beschreibung, erstellt_am)
  select
    'Reservierung: ' || r.fahrer || ' am ' ||
    to_char(r.datum, 'DD') || '. ' ||
    case extract(month from r.datum)::int
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
    end,
    'daten',
    r.datum,
    r.notiz,
    r.erstellt_am
  from public.reservierungen r
  where not exists (
    select 1 from public.changelog c
    where c.titel like 'Reservierung: ' || r.fahrer || '%'
    and c.datum = r.datum
  );

  get diagnostics v_count = row_count;
  raise notice 'Backfilled % reservierungen to changelog', v_count;
end $$;
