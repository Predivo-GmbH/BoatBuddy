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

-- Seed initial entries from app history (2021-2026)
-- NOTE: Use only ASCII-safe characters in SQL seed data.
-- German Umlaute must be written as Unicode escapes (E'' syntax) to avoid
-- double-encoding when applied via Management API or shell pipelines.
-- Historical data manually inserted via REST API to avoid encoding issues during migration.
-- This migration creates the schema; historical entries are seeded separately.
insert into changelog (datum, titel, beschreibung, kategorie) values
  ('2026-05-15', 'BoatBuddy gestartet', 'Die App ist live! Dashboard, Finanzen, Kalender, Gast-Sessions, Nutzungslog und Boot-Verwaltung stehen bereit.', 'neu'),
  ('2026-05-15', 'Rechnungs-Upload mit KI', E'Rechnungen k\u00F6nnen per Drag-and-Drop hochgeladen werden. Eine KI erkennt automatisch Betrag, Datum und Kategorie.', 'neu'),
  ('2026-05-16', 'Premium UI Redesign', E'Neues Design mit Gradient-Karten, Micro-Animationen und animierten Diagrammen f\u00FCr ein moderneres Erscheinungsbild.', 'verbesserung'),
  ('2026-05-17', 'Mobile Optimierung', E'Tabs, Scrollverhalten, Diagramme und Tabellen wurden f\u00FCr die Nutzung auf dem Handy optimiert.', 'verbesserung'),
  ('2026-05-18', 'Handy-Upload', E'Fotos direkt vom Handy hochladen per QR-Code-Scan am Desktop oder Kamera-Ausl\u00F6ser am Handy.', 'neu'),
  ('2026-05-19', 'Klickbare Dashboard-Karten', E'Die Statistik-Karten auf dem Dashboard sind jetzt klickbar und f\u00FChren direkt zur jeweiligen Seite.', 'verbesserung'),
  ('2026-05-20', 'Offene Posten Widget', E'Das Dashboard zeigt jetzt alle offenen finanziellen Posten auf einen Blick \u2014 kein Nachschauen auf mehreren Seiten n\u00F6tig.', 'neu'),
  ('2026-05-21', 'Kalender-Bearbeitung', E'Reservierungen k\u00F6nnen jetzt bearbeitet und gel\u00F6scht werden. Pedro als Fahrer hinzugef\u00FCgt, Motorboot-Icon integriert.', 'verbesserung'),
  ('2026-05-22', 'Einnahmen-Karte', E'Die Beitr\u00E4ge-Karte wurde durch eine Einnahmen-Karte ersetzt, die alle Bankgutschriften anzeigt.', 'verbesserung'),
  ('2026-05-23', 'Jahresfilter und Suchfeld', E'Ausgaben k\u00F6nnen jetzt nach Jahr gefiltert werden. Neues Suchfeld mit Autocomplete f\u00FCr die Bezeichnung.', 'verbesserung'),
  ('2026-05-24', 'Diagramm-Verbesserungen', E'Monatsdiagramm und Kategorie-Chart \u00FCberarbeitet: korrekte Logik, Datumsanzeige ohne \u00DCberlappung.', 'fix'),
  ('2026-05-25', 'Treibstoffkosten', 'Treibstoffkosten werden jetzt im Nutzungslog angezeigt, inklusive Kosten pro Betriebsstunde.', 'neu'),
  ('2026-05-26', 'Gast-Name Autocomplete', E'Bei neuer Gast-Session wird der eingetippte Name automatisch \u00FCbernommen \u2014 kein Doppeltippen mehr.', 'verbesserung'),
  ('2026-05-27', 'Berechneter Kontostand', 'Das Bootkonto wird jetzt automatisch berechnet: Startsaldo plus Einnahmen minus Ausgaben. Startsaldo ist konfigurierbar.', 'neu'),
  ('2026-05-28', 'Ferien-Kalender', E'Ferien k\u00F6nnen jetzt direkt im Kalender eingetragen, bearbeitet und gel\u00F6scht werden. Ferienzeiten werden farblich hervorgehoben.', 'neu'),
  ('2026-05-29', 'Betriebsstunden editierbar', E'Der aktuelle Z\u00E4hlerstand vom Boot kann jetzt direkt eingegeben werden. Die Differenz wird automatisch berechnet.', 'verbesserung'),
  ('2026-06-01', 'Wartungs-Tracker', E'Unter Boot > Wartung k\u00F6nnen Wartungsaufgaben erfasst, als erledigt markiert und gel\u00F6scht werden. \u00DCberf\u00E4llige Aufgaben werden rot markiert.', 'neu'),
  ('2026-06-03', E'Finanz\u00FCbersicht erweitert', E'R\u00FCckerstattungen, Einzahlungen und Abrechnungen werden jetzt separat erfasst und \u00FCbersichtlich dargestellt.', 'verbesserung'),
  ('2026-06-05', 'Gentleman-Rules', E'Die Bootnutzungs-Regeln k\u00F6nnen jetzt direkt in der App bearbeitet, hinzugef\u00FCgt und gel\u00F6scht werden.', 'neu'),
  ('2026-06-07', E'54 Tankeintr\u00E4ge importiert', E'Alle bisherigen Tankeintr\u00E4ge aus der Excel-Tabelle wurden in die App \u00FCbernommen.', 'daten'),
  ('2026-06-08', 'IBAN & Auszahlungsregeln', E'Roger hat die Austrittsregeln und IBAN-Informationen hinterlegt \u2014 jeder Eigent\u00FCmer sieht seine relevanten Daten.', 'daten'),
  ('2026-06-09', 'Ferien eingetragen', E'Roger hat seine Ferienzeiten im Kalender hinterlegt \u2014 so sehen alle Mitbesitzer, wann das Boot frei ist.', 'daten'),
  ('2026-06-10', 'Neuigkeiten-Seite', E'Diese Seite! Alle \u00C4nderungen und neuen Funktionen werden jetzt chronologisch als Timeline angezeigt.', 'neu');
