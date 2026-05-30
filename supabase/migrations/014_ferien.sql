create table public.ferien (
  id          uuid primary key default gen_random_uuid(),
  fahrer      text not null,
  von_datum   date not null,
  bis_datum   date not null,
  notiz       text,
  erstellt_am timestamptz not null default now(),
  constraint ferien_datum_check check (bis_datum >= von_datum)
);

create index idx_ferien_fahrer on public.ferien(fahrer);
create index idx_ferien_von_datum on public.ferien(von_datum);
create index idx_ferien_bis_datum on public.ferien(bis_datum);

alter table public.ferien enable row level security;
create policy "anon_all" on public.ferien for all to anon using (true) with check (true);
