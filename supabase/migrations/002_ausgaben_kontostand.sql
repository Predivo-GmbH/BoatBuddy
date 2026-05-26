create table public.kontostand_snapshots (
  id          uuid primary key default gen_random_uuid(),
  betrag      numeric(10,2) not null,
  datum       date not null,
  notiz       text,
  erstellt_am timestamptz not null default now()
);

create index idx_kontostand_datum on public.kontostand_snapshots(datum desc);

alter table public.kontostand_snapshots enable row level security;
create policy "anon_all" on public.kontostand_snapshots for all to anon using (true) with check (true);

create table public.ausgaben (
  id            uuid primary key default gen_random_uuid(),
  bezeichnung   text not null,
  betrag        numeric(10,2) not null,
  kategorie     text not null,
  datum         date not null,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);

create index idx_ausgaben_datum on public.ausgaben(datum desc);
create index idx_ausgaben_kategorie on public.ausgaben(kategorie);

alter table public.ausgaben enable row level security;
create policy "anon_all" on public.ausgaben for all to anon using (true) with check (true);
