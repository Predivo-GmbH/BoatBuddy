-- Changelog / Neuigkeiten table for tracking app changes visible to visitors
create table if not exists changelog (
  id uuid primary key default gen_random_uuid(),
  datum date not null default current_date,
  titel text not null,
  beschreibung text,
  kategorie text not null default 'neu' check (kategorie in ('neu', 'verbesserung', 'fix', 'daten')),
  erstellt_am timestamptz not null default now()
);

-- RLS: public read (PasswordGate handles access), all operations allowed for anon
alter table changelog enable row level security;

create policy "changelog_read" on changelog
  for select to anon, authenticated using (true);

create policy "changelog_insert" on changelog
  for insert to anon, authenticated with check (true);

create policy "changelog_update" on changelog
  for update to anon, authenticated using (true) with check (true);

create policy "changelog_delete" on changelog
  for delete to anon, authenticated using (true);

-- Seed initial entries from recent feature history
insert into changelog (datum, titel, beschreibung, kategorie) values
  ('2026-05-15', 'BoatBuddy gestartet', 'Die App ist live! Dashboard, Finanzen, Kalender, Gast-Sessions, Nutzungslog und Boot-Verwaltung stehen bereit.', 'neu'),
  ('2026-05-18', 'Handy-Upload', 'Fotos direkt vom Handy hochladen per QR-Code-Scan am Desktop oder Kamera-Auslöser am Handy.', 'neu'),
  ('2026-05-20', 'Offene Posten Widget', 'Das Dashboard zeigt jetzt alle offenen finanziellen Posten auf einen Blick — kein Nachschauen auf mehreren Seiten nötig.', 'neu'),
  ('2026-05-22', 'Einnahmen-Karte', 'Die Beiträge-Karte wurde durch eine Einnahmen-Karte ersetzt, die alle Bankgutschriften anzeigt.', 'verbesserung'),
  ('2026-05-24', 'Diagramm-Verbesserungen', 'Monatsdiagramm und Kategorie-Chart überarbeitet: korrekte Logik, Datumsanzeige ohne Überlappung.', 'fix'),
  ('2026-05-26', 'Gast-Name Autocomplete', 'Bei neuer Gast-Session wird der eingetippte Name automatisch übernommen — kein Doppeltippen mehr.', 'verbesserung'),
  ('2026-05-28', 'Ferien-Kalender', 'Ferien können jetzt direkt im Kalender eingetragen, bearbeitet und gelöscht werden. Ferienzeiten werden farblich hervorgehoben.', 'neu'),
  ('2026-06-01', 'Wartungs-Tracker', 'Unter Boot > Wartung können Wartungsaufgaben erfasst, als erledigt markiert und gelöscht werden. Überfällige Aufgaben werden rot markiert.', 'neu'),
  ('2026-06-05', 'Gentleman-Rules', 'Die Bootnutzungs-Regeln können jetzt direkt in der App bearbeitet, hinzugefügt und gelöscht werden.', 'neu'),
  ('2026-06-08', 'IBAN & Auszahlungsregeln', 'Roger hat die Austrittsregeln und IBAN-Informationen hinterlegt — jeder Eigentümer sieht seine relevanten Daten.', 'daten'),
  ('2026-06-09', 'Ferien eingetragen', 'Roger hat seine Ferienzeiten im Kalender hinterlegt — so sehen alle Mitbesitzer, wann das Boot frei ist.', 'daten');
