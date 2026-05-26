create table public.boot_stats (
  id                    uuid primary key default gen_random_uuid(),
  gesamtstunden         numeric(8,2) not null default 0,
  kaufdatum             date,
  modell                text default 'Mastercraft',
  motorstunden_grenze   numeric(8,2),
  notiz                 text,
  aktualisiert_am       timestamptz not null default now()
);

alter table public.boot_stats enable row level security;
create policy "anon_all" on public.boot_stats for all to anon using (true) with check (true);

-- Insert initial row
insert into public.boot_stats (gesamtstunden, modell) values (0, 'Mastercraft');
