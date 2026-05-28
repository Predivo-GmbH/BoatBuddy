-- WS3: Ownership, Maintenance, Gentleman-Rules

-- Ownership shares per fahrer
create table public.eigentuemer (
  id              uuid primary key default gen_random_uuid(),
  fahrer          text not null,
  anteil_prozent  numeric(5,2) not null default 50,
  einstieg_datum  date,
  notiz           text,
  erstellt_am     timestamptz not null default now()
);

alter table public.eigentuemer enable row level security;
create policy "anon_all" on public.eigentuemer for all to anon using (true) with check (true);

-- Roger paid 40k, Dani paid 15k of the 55k purchase (Sept 2021)
-- Roger = 40000/55000 = 72.73%, Dani = 15000/55000 = 27.27%
insert into public.eigentuemer (fahrer, anteil_prozent, einstieg_datum) values
  ('roger', 72.73, '2021-09-01'),
  ('dani', 27.27, '2021-09-01');

-- Settlement config (single row, like boot_stats)
create table public.abrechnung_config (
  id                    uuid primary key default gen_random_uuid(),
  boot_marktwert        numeric(12,2) default 0,
  bewertung_datum       date,
  abschreibung_prozent  numeric(5,2) default 10,
  kuendigungsfrist_monate integer default 6,
  beitrag_pro_monat     numeric(8,2) default 400,
  notiz                 text,
  aktualisiert_am       timestamptz not null default now()
);

alter table public.abrechnung_config enable row level security;
create policy "anon_all" on public.abrechnung_config for all to anon using (true) with check (true);

-- Kaufpreis 55000 CHF, purchased Sept 2021
-- Exit rule from Gentleman-Rules: 1 Saison Kündigungsfrist, bis Ende Juli
insert into public.abrechnung_config (boot_marktwert, bewertung_datum, abschreibung_prozent, kuendigungsfrist_monate, beitrag_pro_monat)
  values (55000, '2021-09-05', 10, 6, 400);

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

-- No seed data for wartung — users add their own tasks

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

-- Real rules from Excel "Gentleman-Rules" sheet
insert into public.gentleman_rules (regel, sortierung) values
  ('Alle: 400 Fr. / Mt. An Daniel Poletti überweisen: CH78 0844 0259 1629 9200 1 (Bank Cler, ZAK Konto)', 1),
  ('Alle: Beteiligung zu je 1/2 für Unterhalt, Revision, Winterlager, etc.', 2),
  ('Alle: Beteiligung zu je 1/2 für Benzin-Kosten (Ausnahmen bei extremer Nutzung wie langes Waken, etc.)', 3),
  ('Es gelten allgemein Gentleman-Rules', 4),
  ('Vor Benutzung (wenn möglich frühzeitig) Info in Chat. Für jedes Mitglied sind immer mind. 2 Plätze freizuhalten', 5),
  ('Boot wird durch Mäts Bühler (mmc Mastercraft GmbH) gewartet etc. (Bei Problemen sofort an Mäts anrufen)', 6),
  ('Das Boot wird jeden Winter ausgewassert (ca. Oktober/November) und im Frühling eingewassert (ca. April)', 7),
  ('Allgemeines wird bei einem Bierli geklärt (wer was abklärt etc.)', 8),
  ('Rückzug aus "Vertrag": 1 Saison Kündigungsfrist, bis Ende Juli. (Bsp: Ende Juli 2024 kündigen und noch bis Ende 2024 bezahlen, dann ist man aus dem Vertrag. Über Bootskosten wird dann noch gesprochen. Valabler "Nachmieter" wird wie bei einer Whg gehandhabt)', 9),
  ('Bootsschlüssel bleibt auf dem Boot (steckt nicht). Blache jeden Abend übers Boot', 10),
  ('Das Boot ist für Roger und Dani gedacht. Freunde sind immer willkommen, aber nicht das ganze Dorf ;)', 11),
  ('Auf dem Boot ist mindestens die vorgeschriebene Minimal-Ausrüstung (Feuerlöscher, Schwimmwesten, etc.)', 12),
  ('Persönliche Gegenstände werden Abends nach Hause genommen (Badtuch, Getränke, Abfall, etc.)', 13),
  ('Gelegentliche selbständige Reinigung erhöht die Lebensdauer (Nach jeder Fahrt 5min reinigen)', 14),
  ('50 Fr. / Kopf Wake/Surf à la discretion', 15),
  ('Ab 01.01.2024 = 25 Fr./10min Wakesurfing für Gäste', 16);
