create table public.gastsessions (
  id            uuid primary key default gen_random_uuid(),
  gast_name     text not null,
  betrag        numeric(10,2) not null default 25.00,
  bezahlt_an    text not null,
  datum         date not null,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);

create index idx_gastsessions_datum on public.gastsessions(datum desc);
create index idx_gastsessions_bezahlt_an on public.gastsessions(bezahlt_an);

alter table public.gastsessions enable row level security;
create policy "anon_all" on public.gastsessions for all to anon using (true) with check (true);
