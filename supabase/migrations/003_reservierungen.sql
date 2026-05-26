create table public.reservierungen (
  id          uuid primary key default gen_random_uuid(),
  fahrer      text not null,
  datum       date not null,
  ganzer_tag  boolean not null default true,
  von_zeit    time,
  bis_zeit    time,
  notiz       text,
  erstellt_am timestamptz not null default now(),
  unique (datum, fahrer)
);

create index idx_reservierungen_datum on public.reservierungen(datum);
create index idx_reservierungen_fahrer on public.reservierungen(fahrer);

alter table public.reservierungen enable row level security;
create policy "anon_all" on public.reservierungen for all to anon using (true) with check (true);
