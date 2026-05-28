-- WS3: Ownership, Maintenance, Gentleman-Rules

-- Ownership shares per fahrer
create table public.eigentuemer (
  id              uuid primary key default gen_random_uuid(),
  fahrer          text not null,
  anteil_prozent  numeric(5,2) not null default 33.33,
  einstieg_datum  date,
  notiz           text,
  erstellt_am     timestamptz not null default now()
);

alter table public.eigentuemer enable row level security;
create policy "anon_all" on public.eigentuemer for all to anon using (true) with check (true);

-- Insert default shares (equal split)
insert into public.eigentuemer (fahrer, anteil_prozent, einstieg_datum) values
  ('roger', 33.33, '2021-01-01'),
  ('dani', 33.33, '2021-01-01'),
  ('jan', 33.34, '2021-01-01');

-- Settlement config (single row, like boot_stats)
create table public.abrechnung_config (
  id                    uuid primary key default gen_random_uuid(),
  boot_marktwert        numeric(12,2) default 0,
  bewertung_datum       date,
  abschreibung_prozent  numeric(5,2) default 10,
  kuendigungsfrist_monate integer default 6,
  notiz                 text,
  aktualisiert_am       timestamptz not null default now()
);

alter table public.abrechnung_config enable row level security;
create policy "anon_all" on public.abrechnung_config for all to anon using (true) with check (true);

insert into public.abrechnung_config (boot_marktwert, bewertung_datum, abschreibung_prozent, kuendigungsfrist_monate)
  values (0, now()::date, 10, 6);

-- Maintenance schedule
create table public.wartung (
  id              uuid primary key default gen_random_uuid(),
  bezeichnung     text not null,
  intervall_monate integer,
  naechstes_datum date,
  zustaendig      text,
  erledigt        boolean not null default false,
  erledigt_am     date,
  notiz           text,
  erstellt_am     timestamptz not null default now()
);

alter table public.wartung enable row level security;
create policy "anon_all" on public.wartung for all to anon using (true) with check (true);

-- Seed common maintenance tasks
insert into public.wartung (bezeichnung, intervall_monate, naechstes_datum, zustaendig) values
  ('Wintereinlagerung', 12, '2026-10-15', null),
  ('Frühlings-Check / Auswassern', 12, '2026-04-01', null),
  ('Motoröl & Filter wechseln', 12, '2026-04-01', null),
  ('Antifouling erneuern', 12, '2026-03-15', null),
  ('Impeller prüfen/wechseln', 24, '2027-03-15', null),
  ('Feuerlöscher prüfen', 24, '2027-01-01', null);

-- Gentleman-Rules
create table public.gentleman_rules (
  id          uuid primary key default gen_random_uuid(),
  regel       text not null,
  sortierung  integer not null default 0,
  aktiv       boolean not null default true,
  erstellt_am timestamptz not null default now()
);

alter table public.gentleman_rules enable row level security;
create policy "anon_all" on public.gentleman_rules for all to anon using (true) with check (true);

-- Seed default rules
insert into public.gentleman_rules (regel, sortierung) values
  ('Boot nach jeder Fahrt reinigen (Deck abspülen, Sitze trocknen)', 1),
  ('Treibstoff auffüllen, wenn Tank unter ¼', 2),
  ('Nutzungslog immer sofort nach der Fahrt ausfüllen', 3),
  ('Reservierung im Kalender eintragen — keine spontanen Fahrten ohne Check', 4),
  ('Gäste-Sessions immer erfassen und abrechnen', 5),
  ('Schäden oder Auffälligkeiten sofort melden (Gruppe)', 6),
  ('Kein Alkohol für den Fahrer', 7),
  ('Schwimmwesten für alle Kinder obligatorisch', 8),
  ('Boot nicht bei Gewitter oder Sturmwarnung nutzen', 9),
  ('Schlüssel immer am vereinbarten Ort zurücklegen', 10);
