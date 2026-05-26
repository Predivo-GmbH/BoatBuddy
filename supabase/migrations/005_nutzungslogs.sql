create table public.nutzungslogs (
  id                uuid primary key default gen_random_uuid(),
  datum             date not null unique,
  fahrer            text not null,
  betriebsstunden   numeric(5,2) not null,
  treibstoff_liter  numeric(6,2),
  aktivitaeten      jsonb not null default '[]',
  notiz             text,
  erstellt_am       timestamptz not null default now()
);

create index idx_nutzungslogs_datum on public.nutzungslogs(datum desc);

alter table public.nutzungslogs enable row level security;
create policy "anon_all" on public.nutzungslogs for all to anon using (true) with check (true);
