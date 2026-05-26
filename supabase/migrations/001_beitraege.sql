create table public.beitraege (
  id          uuid primary key default gen_random_uuid(),
  fahrer      text not null,
  betrag      numeric(10,2) not null,
  monat       date not null,
  notiz       text,
  erstellt_am timestamptz not null default now()
);

create unique index idx_beitraege_fahrer_monat on public.beitraege(fahrer, monat);
create index idx_beitraege_monat on public.beitraege(monat desc);

alter table public.beitraege enable row level security;
create policy "anon_all" on public.beitraege for all to anon using (true) with check (true);
