/**
 * Historical Data Import Script for BoatBuddy
 * Parses xlsx-dump.txt and generates SQL INSERT statements for Supabase
 *
 * Data sources (from Boot, Mastercraft 2025-06-11.xlsx):
 * - Yearly sheets (2021-2025): Ausgaben, Fixkosten, Ausfahrten, Tanken
 * - Beitraege: Monthly contributions (300 CHF 2021-2023, 400 CHF 2024+)
 * - Boot stats: Already set via migration 007
 *
 * Usage: node scripts/import-historical-data.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DUMP_PATH = path.join(__dirname, '..', 'docs', 'xlsx-dump.txt')

// Read the dump
const dump = fs.readFileSync(DUMP_PATH, 'utf-8')

// Split into sheets
const sheets = {}
const sheetRegex = /========== SHEET: (.+?) ==========/g
let match
const positions = []
while ((match = sheetRegex.exec(dump)) !== null) {
  positions.push({ name: match[1], start: match.index + match[0].length })
}
for (let i = 0; i < positions.length; i++) {
  const end = i + 1 < positions.length ? positions[i + 1].start - positions[i + 1].name.length - 24 : dump.length
  sheets[positions[i].name] = dump.substring(positions[i].start, end).trim()
}

// Helper: parse CSV line (handling quoted fields)
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += line[i]
    }
  }
  result.push(current.trim())
  return result
}

// Helper: parse date from various formats
function parseDate(dateStr) {
  if (!dateStr) return null
  dateStr = dateStr.trim()

  // Format: M/D/YY or M/D/YYYY (US format from Excel)
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (usMatch) {
    let year = parseInt(usMatch[3])
    if (year < 100) year += 2000
    const month = usMatch[1].padStart(2, '0')
    const day = usMatch[2].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Format: DD/MM/YYYY (European)
  const euMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (euMatch) {
    return `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`
  }

  // Format: DD.MM.YYYY
  const dotMatch = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (dotMatch) {
    return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`
  }

  // Format: "Jun 25" or "Juni 25" or "Jan-24"
  const monthNames = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'mai': '05', 'may': '05',
    'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 'okt': '10', 'oct': '10',
    'nov': '11', 'dez': '12', 'dec': '12',
    'januar': '01', 'februar': '02', 'märz': '03', 'april': '04',
    'juni': '06', 'juli': '07', 'august': '08', 'september': '09',
    'oktober': '10', 'november': '11', 'dezember': '12'
  }
  const monthMatch = dateStr.match(/^([A-Za-zä]+)[\s-]+(\d{2,4})$/i)
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase()
    let year = parseInt(monthMatch[2])
    if (year < 100) year += 2000
    const month = monthNames[monthName]
    if (month) return `${year}-${month}-01`
  }

  return null
}

// Helper: map person abbreviation to fahrer key
function mapFahrer(wer) {
  if (!wer) return null
  wer = wer.trim().toLowerCase()
  if (wer === 'r' || wer === 'roger') return 'roger'
  if (wer === 'd' || wer === 'dani' || wer === 'daniel') return 'dani'
  if (wer === 'p' || wer === 'pedro') return 'pedro'
  if (wer === 'bootskasse' || wer === 'bootkasse') return 'bootskasse'
  return null
}

// Helper: parse participants from "R, D" or "R, P, D" format
function parseTeilnehmer(wer) {
  if (!wer) return []
  return wer.split(',').map(s => {
    const trimmed = s.trim().toLowerCase()
    // Handle "R (Abends)" type annotations
    const clean = trimmed.replace(/\s*\(.*?\)\s*/g, '').trim()
    if (clean === 'r') return 'roger'
    if (clean === 'd') return 'dani'
    if (clean === 'p') return 'pedro'
    return null
  }).filter(Boolean)
}

// Helper: escape SQL string
function esc(str) {
  if (str === null || str === undefined) return 'NULL'
  return `'${String(str).replace(/'/g, "''")}'`
}

function num(val) {
  if (val === null || val === undefined || val === '') return 'NULL'
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 'NULL' : n
}

// ============ COLLECT ALL SQL STATEMENTS ============
const sql = []

// ============ 1. BEITRAEGE (Monthly contributions) ============
// 2021 Oct-Dec: Roger, Pedro, Dani at 300 CHF each (boat purchased Sep 2021)
// 2022: Roger, Pedro, Dani at 300 CHF each (12 months)
// 2023 Jan-Jul: Roger, Pedro, Dani at 300 CHF; Aug-Dec: Roger, Dani at 300 CHF (Pedro exits Jul)
// 2024: Roger, Dani at 400 CHF each (raised from 300)
// 2025: Roger, Dani at 400 CHF each

// 2021: Oct-Dec (boat purchased Sep 5)
for (const fahrer of ['roger', 'pedro', 'dani']) {
  for (let m = 10; m <= 12; m++) {
    sql.push(`INSERT INTO public.beitraege (fahrer, betrag, monat) VALUES (${esc(fahrer)}, 300, '2021-${String(m).padStart(2,'0')}-01');`)
  }
}

// 2022: Full year, 3 people, 300 CHF
for (const fahrer of ['roger', 'pedro', 'dani']) {
  for (let m = 1; m <= 12; m++) {
    sql.push(`INSERT INTO public.beitraege (fahrer, betrag, monat) VALUES (${esc(fahrer)}, 300, '2022-${String(m).padStart(2,'0')}-01');`)
  }
}

// 2023: Jan-Jul 3 people, Aug-Dec 2 people (Pedro exits Jul)
for (const fahrer of ['roger', 'pedro', 'dani']) {
  for (let m = 1; m <= 7; m++) {
    sql.push(`INSERT INTO public.beitraege (fahrer, betrag, monat) VALUES (${esc(fahrer)}, 300, '2023-${String(m).padStart(2,'0')}-01');`)
  }
}
for (const fahrer of ['roger', 'dani']) {
  for (let m = 8; m <= 12; m++) {
    sql.push(`INSERT INTO public.beitraege (fahrer, betrag, monat) VALUES (${esc(fahrer)}, 300, '2023-${String(m).padStart(2,'0')}-01');`)
  }
}

// 2024: Full year, 2 people, 400 CHF
for (const fahrer of ['roger', 'dani']) {
  for (let m = 1; m <= 12; m++) {
    sql.push(`INSERT INTO public.beitraege (fahrer, betrag, monat) VALUES (${esc(fahrer)}, 400, '2024-${String(m).padStart(2,'0')}-01');`)
  }
}

// 2025: Full year, 2 people, 400 CHF
for (const fahrer of ['roger', 'dani']) {
  for (let m = 1; m <= 12; m++) {
    sql.push(`INSERT INTO public.beitraege (fahrer, betrag, monat) VALUES (${esc(fahrer)}, 400, '2025-${String(m).padStart(2,'0')}-01');`)
  }
}

console.log(`Generated ${sql.length} beitraege statements`)

// ============ 2. AUSGABEN (Expenses by category) ============
// Fixed costs per year from Totale sheet + individual year sheets

// 2021 fixed costs
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Versicherung AXA (Anteil)', 85.55, 'versicherung', '2021-10-19', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von, notiz) VALUES ('Winterlager RE 1321', 2042.40, 'winterlager', '2021-10-25', 'roger', 'Von Roger privat überwiesen, muss noch beglichen werden');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Bootkauf Mastercraft X2', 55000, 'sonstiges', '2021-09-05', 'bootskasse');`)

// 2022 fixed costs + expenses
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('AXA Versicherung', 610, 'versicherung', '2022-02-25', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Verkehrssteuer', 1200, 'verkehrssteuer', '2022-03-07', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('MMC Frühlingsservice RE 1490', 271, 'fruehlingslager', '2022-04-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Vorführen', 130, 'vorfuehren', '2022-05-17', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('2x Öl von Mats', 72, 'material', '2022-07-15', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Winterlager & Service', 3588, 'winterlager', '2022-12-19', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Bootsplatz', 3600, 'bootsplatz', '2022-01-01', 'bootskasse');`)
// Roger personal 2022
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Wake-Surf Schwimmweste (neu)', 89, 'material', '2022-06-14', 'roger');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Öl (5 Liter)', 86, 'material', '2022-07-27', 'roger');`)
// Dani personal 2022
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Aufstockung Kasse (Steuern & Ausweis)', 96, 'sonstiges', '2022-03-05', 'dani');`)

// 2023 fixed costs + expenses
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Verkehrsamt Wasserfz-Steuer', 1150, 'verkehrssteuer', '2023-02-02', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Bootsplatz', 3600, 'bootsplatz', '2023-02-02', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('AXA Versicherung', 609, 'versicherung', '2023-03-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Frühlingslager (inkl. U-wasseranstr.)', 1722, 'fruehlingslager', '2023-04-19', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Winterlager', 4571, 'winterlager', '2023-11-13', 'bootskasse');`)
// Roger personal 2023
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Kauf von 5l Öl', 86, 'material', '2023-07-26', 'roger');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Trichter für Öl (Ali)', 5, 'material', '2023-08-21', 'roger');`)

// 2024 fixed costs + expenses
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Verkehrsamt Wasserfz-Steuer', 1150, 'verkehrssteuer', '2024-02-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Bootsplatz X-2', 3600, 'bootsplatz', '2024-02-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('AXA Versicherung', 610, 'versicherung', '2024-03-06', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Frühlingslager (inkl. Abgastest)', 768, 'fruehlingslager', '2024-03-28', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von, notiz) VALUES ('Bootsplatz Nr. 2 (Boot Spiegel 1956)', 1675, 'bootsplatz', '2024-04-01', 'bootskasse', 'Mutterschiff-Platz Seite Seematt');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Verkehrsamt Boot Spiegel', 76, 'verkehrssteuer', '2024-05-29', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Bootskauf Spiegel (Marco Trutmann)', 50, 'sonstiges', '2024-06-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Schiffskontrolle Boot Spiegel', 40, 'vorfuehren', '2024-07-03', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von, notiz) VALUES ('Bootsplatz X-2 (2025)', 3725, 'bootsplatz', '2024-12-19', 'bootskasse', 'Neu 3725 statt 3600 CHF');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Winterlager & Service', 4152, 'winterlager', '2024-10-07', 'bootskasse');`)
// Roger personal 2024
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Ausweis Simon Diener (Zweites Boot)', 30, 'sonstiges', '2024-05-01', 'roger');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Möwen-Schreck System', 15, 'material', '2024-05-01', 'roger');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Blache Zweites Boot (Spiegel)', 20, 'material', '2024-06-01', 'roger');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('50.- Engel Gutschein Albert Trutmann', 50, 'sonstiges', '2024-11-29', 'roger');`)
// Dani personal 2024
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Kontrollschild Nümmerli für Spiegel-Boot', 13, 'sonstiges', '2024-06-01', 'dani');`)

// 2025 fixed costs + expenses
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Boot Spiegel Verkehrssteuern', 26, 'verkehrssteuer', '2025-01-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Verkehrsamt X-2 Wasserfzg-Steuern', 1150, 'verkehrssteuer', '2025-01-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('AXA Versicherung', 610, 'versicherung', '2025-01-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('MMC Frühlingswerft', 2113, 'fruehlingslager', '2025-01-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Vorführen', 130, 'vorfuehren', '2025-01-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Winterlagerpaket', 4166.55, 'winterlager', '2025-11-04', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Bootsplatz 2025', 3725, 'bootsplatz', '2025-01-01', 'bootskasse');`)
sql.push(`INSERT INTO public.ausgaben (bezeichnung, betrag, kategorie, datum, bezahlt_von) VALUES ('Bootsplatz Nr. 2 HG', 1675, 'bootsplatz', '2025-01-01', 'bootskasse');`)

console.log(`Generated ${sql.length} statements (including ausgaben)`)

// ============ 3. NUTZUNGSLOGS (Outings/Ausfahrten) ============

// 2022 outings (motor-h start: ~695, end: 785)
const outings2022 = [
  ['2022-03-16', 'dani', ['pedro','dani'], 1.5, 696],
  ['2022-03-19', 'roger', ['roger','pedro'], 2, null],
  ['2022-03-22', 'dani', ['dani'], 1, null],
  ['2022-04-18', 'roger', ['roger'], 1.5, null],
  ['2022-05-12', 'roger', ['roger','pedro'], 1.5, null],
  ['2022-05-15', 'roger', ['roger'], 3, null],
  ['2022-05-17', 'pedro', ['pedro'], 1, null],
  ['2022-05-26', 'pedro', ['pedro'], 2, null],
  ['2022-06-11', 'roger', ['roger','pedro','dani'], 4, null],
  ['2022-06-12', 'roger', ['roger'], 2, null],
  ['2022-06-18', 'pedro', ['pedro'], 3, null],
  ['2022-06-19', 'roger', ['roger'], 4, null],
  ['2022-06-20', 'roger', ['roger','pedro'], 2, null],
  ['2022-06-26', 'roger', ['roger','dani'], 5, null],
  ['2022-06-29', 'roger', ['roger','pedro'], 3, null],
  ['2022-07-02', 'pedro', ['pedro'], 2, null],
  ['2022-07-03', 'roger', ['roger','dani'], 5, null],
  ['2022-07-06', 'roger', ['roger','dani'], 2.5, 737.6],
  ['2022-07-08', 'pedro', ['pedro'], 1.5, null],
  ['2022-07-09', 'dani', ['dani'], 1.5, 741],
  ['2022-07-11', 'roger', ['roger','pedro','dani'], 3, 745.3],
  ['2022-07-14', 'roger', ['roger','pedro','dani'], 3, 750.8],
  ['2022-07-16', 'roger', ['roger'], 3, 753.6],
  ['2022-07-17', 'roger', ['roger','dani'], 5, 757.5],
  ['2022-07-18', 'roger', ['roger','dani'], 3, 759.8],
  ['2022-07-21', 'dani', ['dani'], 3, 762.9],
  ['2022-07-24', 'roger', ['roger','dani'], 6, 768.2],
  ['2022-07-25', 'roger', ['roger'], 1.5, 769.4],
  ['2022-07-27', 'dani', ['dani'], 2.5, 772],
  ['2022-07-31', 'roger', ['roger','pedro'], 1, 773.1],
  ['2022-08-01', 'roger', ['roger'], 1, null],
  ['2022-08-04', 'roger', ['roger'], 1, null],
  ['2022-08-05', 'pedro', ['pedro'], 2, 779.8],
  ['2022-08-10', 'roger', ['roger','pedro'], 2, null],
  ['2022-08-12', 'pedro', ['pedro'], 2, null],
  ['2022-08-14', 'roger', ['roger'], 1, null],
]

for (const [datum, fahrer, teilnehmer, stunden, mhStand] of outings2022) {
  sql.push(`INSERT INTO public.nutzungslogs (datum, fahrer, betriebsstunden, teilnehmer, motorstunden_stand, aktivitaeten) VALUES ('${datum}', ${esc(fahrer)}, ${stunden}, '{${teilnehmer.map(t => `"${t}"`).join(',')}}', ${mhStand ?? 'NULL'}, '[]');`)
}

// 2023 outings (motor-h start: 785, end: 872)
const outings2023 = [
  ['2023-05-15', 'pedro', ['pedro'], 1, 786, null],
  ['2023-06-03', 'roger', ['roger','dani'], 2.5, 789, null],
  ['2023-06-05', 'roger', ['roger','pedro','dani'], 2, 791, null],
  ['2023-06-06', 'roger', ['roger','dani'], 0.5, 792, 'Platz-Test'],
  ['2023-06-08', 'roger', ['roger','dani'], 3.5, 795, null],
  ['2023-06-10', 'roger', ['roger','dani'], 4, 799, null],
  ['2023-06-13', 'dani', ['dani'], 1, 800, null],
  ['2023-06-15', 'pedro', ['pedro'], 0.5, 800, null],
  ['2023-06-17', 'roger', ['roger','pedro','dani'], 2.5, 802, null],
  ['2023-06-18', 'roger', ['roger','dani'], 3.5, 806, null],
  ['2023-06-28', 'roger', ['roger','dani'], 3, 809, 'Öl refill (1L)'],
  ['2023-07-06', 'roger', ['roger','pedro','dani'], 3.5, 812, null],
  ['2023-07-08', 'roger', ['roger','pedro','dani'], 4.5, 816, null],
  ['2023-07-09', 'pedro', ['pedro'], 2.5, 818, null],
  ['2023-07-10', 'dani', ['dani'], 1, 820, null],
  ['2023-07-15', 'roger', ['roger','dani'], 4, 824, 'Öl refill (0.5L)'],
  ['2023-07-20', 'roger', ['roger','pedro','dani'], 3.5, 827, null],
  ['2023-07-22', 'roger', ['roger','dani'], 3, 830, null],
  ['2023-07-23', 'roger', ['roger'], 3, 833, null],
  ['2023-07-31', 'roger', ['roger'], 2, 835, null],
  ['2023-08-02', 'roger', ['roger','dani'], 2.5, 837, 'Öl refill (1.5L)'],
  ['2023-08-11', 'roger', ['roger','dani'], 3, 840, null],
  ['2023-08-11', 'roger', ['roger'], 2, 842, 'Abends'],
  ['2023-08-14', 'roger', ['roger','dani'], 2, 844, null],
  ['2023-08-15', 'roger', ['roger'], 2, 846, null],
  ['2023-08-16', 'roger', ['roger','dani'], 2, 848, null],
  ['2023-08-19', 'roger', ['roger','dani'], 3.5, 852, 'Öl refill (0.2L)'],
  ['2023-08-20', 'roger', ['roger','dani'], 2, 854, null],
  ['2023-08-21', 'roger', ['roger'], 1, 855, null],
  ['2023-08-22', 'dani', ['dani'], 3, 859, null],
  ['2023-08-23', 'roger', ['roger','dani'], 3, 862, null],
  ['2023-09-02', 'roger', ['roger'], 1, 863, null],
  ['2023-09-05', 'dani', ['dani'], 1, 864, null],
  ['2023-09-06', 'roger', ['roger','dani'], 2, 866, 'Öl refill (1.2L)'],
  ['2023-09-09', 'roger', ['roger','dani'], 2, 869, null],
  ['2023-09-15', 'roger', ['roger'], 2, 871, null],
  ['2023-10-01', 'roger', ['roger','dani'], 1, 872, 'Letzte Fahrt 2023 (Obermatt-Zmittag)'],
]

for (const [datum, fahrer, teilnehmer, stunden, mhStand, notiz] of outings2023) {
  sql.push(`INSERT INTO public.nutzungslogs (datum, fahrer, betriebsstunden, teilnehmer, motorstunden_stand, aktivitaeten, notiz) VALUES ('${datum}', ${esc(fahrer)}, ${stunden}, '{${teilnehmer.map(t => `"${t}"`).join(',')}}', ${mhStand ?? 'NULL'}, '[]', ${esc(notiz)});`)
}

// 2024 outings (motor-h start: 872, end: 911)
const outings2024 = [
  ['2024-06-17', 'roger', ['roger','dani'], 1.5, 873, null],
  ['2024-06-18', 'dani', ['dani'], 1.5, 875, null],
  ['2024-06-27', 'roger', ['roger','dani'], 1.5, 876, null],
  ['2024-07-15', 'roger', ['roger'], 1, 877, null],
  ['2024-07-18', 'roger', ['roger','dani'], 2, 879, 'Öl Check'],
  ['2024-07-20', 'roger', ['roger','dani'], 3, 882, null],
  ['2024-07-25', 'roger', ['roger','dani'], 2, 884, null],
  ['2024-07-29', 'roger', ['roger','dani'], 2, 886, 'Öl Check'],
  ['2024-07-30', 'dani', ['dani'], 2, 888, null],
  ['2024-08-05', 'dani', ['dani'], 2, 890, 'Öl Check'],
  ['2024-08-06', 'dani', ['dani'], 1, 891.5, 'Öl 0.5 Liter'],
  ['2024-08-11', 'dani', ['dani'], 1, 893, null],
  ['2024-08-12', 'dani', ['dani'], 1, 894, null],
  ['2024-08-13', 'dani', ['dani'], 2, 896, null],
  ['2024-08-20', 'dani', ['dani'], 1.5, 897, 'Öl Check'],
  ['2024-08-22', 'roger', ['roger'], 1, 899, null],
  ['2024-08-23', 'roger', ['roger','dani'], 1, 900, null],
  ['2024-08-24', 'roger', ['roger','dani'], 5, 906, null],
  ['2024-08-28', 'roger', ['roger'], 0.5, 906, null],
  ['2024-08-29', 'roger', ['roger'], 1, 907, null],
  ['2024-08-31', 'roger', ['roger'], 1, 908, null],
  ['2024-09-07', 'dani', ['dani'], 3, 911, 'Öl 1 Liter'],
]

for (const [datum, fahrer, teilnehmer, stunden, mhStand, notiz] of outings2024) {
  sql.push(`INSERT INTO public.nutzungslogs (datum, fahrer, betriebsstunden, teilnehmer, motorstunden_stand, aktivitaeten, notiz) VALUES ('${datum}', ${esc(fahrer)}, ${stunden}, '{${teilnehmer.map(t => `"${t}"`).join(',')}}', ${mhStand ?? 'NULL'}, '[]', ${esc(notiz)});`)
}

// 2025 outings (motor-h start: 911, end: 939)
const outings2025 = [
  ['2025-04-14', 'roger', ['roger','dani'], 0, 911, 'Einwassern'],
  ['2025-05-01', 'roger', ['roger'], 0.5, 912, null],
  ['2025-05-30', 'roger', ['roger'], 1, 913, null],
  ['2025-05-31', 'dani', ['dani'], 1, 914, null],
  ['2025-06-11', 'roger', ['roger','dani'], 1.5, 915, '40 Liter getankt nach 6x Wakesurfen'],
  ['2025-06-12', 'roger', ['roger','dani'], 1.5, 917, null],
  ['2025-06-13', 'dani', ['dani'], 1, 918, null],
  ['2025-06-14', 'roger', ['roger','dani'], 1, 919, null],
  ['2025-06-21', 'roger', ['roger'], 1.5, 920, null],
  ['2025-06-28', 'roger', ['roger'], 1.5, 922, null],
  ['2025-06-29', 'roger', ['roger'], 2, 924, null],
  ['2025-07-12', 'roger', ['roger','dani'], 1, 925, 'Öl 0.5L'],
  ['2025-07-20', 'roger', ['roger','dani'], 2, 927, null],
  ['2025-08-08', 'roger', ['roger','dani'], 1.5, 928, 'Öl check (i.O.)'],
  ['2025-08-09', 'roger', ['roger','dani'], 3.5, 932, null],
  ['2025-08-10', 'roger', ['roger'], 0.5, 933, null],
  ['2025-08-12', 'dani', ['dani'], 1.5, 934, null],
  ['2025-08-15', 'roger', ['roger','dani'], 2.5, 937, null],
  ['2025-09-08', 'roger', ['roger','dani'], 0.5, 937, 'Boot Vorführung Kt. SZ in Küssnacht'],
  ['2025-09-20', 'roger', ['roger','dani'], 2, 939, null],
  ['2025-10-02', 'roger', ['roger','dani'], 0, 939, 'Auswassern'],
]

for (const [datum, fahrer, teilnehmer, stunden, mhStand, notiz] of outings2025) {
  sql.push(`INSERT INTO public.nutzungslogs (datum, fahrer, betriebsstunden, teilnehmer, motorstunden_stand, aktivitaeten, notiz) VALUES ('${datum}', ${esc(fahrer)}, ${stunden}, '{${teilnehmer.map(t => `"${t}"`).join(',')}}', ${mhStand ?? 'NULL'}, '[]', ${esc(notiz)});`)
}

console.log(`Generated ${sql.length} statements (including nutzungslogs)`)

// ============ 4. TANKEN (Fuel entries) ============

// 2022 fuel
const fuel2022 = [
  ['2022-06-11', 'roger', 'Hergiswil', 233, 100, null],
  ['2022-06-18', 'pedro', 'Weggis', 148, 64, null],
  ['2022-06-19', 'roger', null, 255, 108, null],
  ['2022-06-26', 'dani', null, 239, 102, null],
  ['2022-07-03', 'dani', null, 233, 101, 735.1],
  ['2022-07-06', 'roger', null, 235, 102, 737.6],
  ['2022-07-08', 'pedro', null, 92, 41, 739.8],
  ['2022-07-14', 'pedro', null, 264, 114, 746.8],
  ['2022-07-16', 'roger', null, 201, 89, null],
  ['2022-07-17', 'roger', null, 195, 86, 756.5],
  ['2022-07-21', 'dani', null, 206, 91, 761.9],
  ['2022-07-24', 'roger', null, 251, 111, 767.8],
  ['2022-07-31', 'pedro', null, 222, 98, 773.1],
  ['2022-08-05', 'pedro', 'Hergiswil', 229, 103, 779.8],
]

for (const [datum, fahrer, ort, betrag, liter, mhStand] of fuel2022) {
  sql.push(`INSERT INTO public.tanken (datum, fahrer, ort, betrag, liter, motorstunden_stand) VALUES ('${datum}', ${esc(fahrer)}, ${esc(ort)}, ${betrag}, ${liter}, ${mhStand ?? 'NULL'});`)
}

// 2023 fuel
const fuel2023 = [
  ['2023-06-08', 'roger', 'Hergiswil', 171, 92, 793],
  ['2023-06-10', 'dani', 'Hergiswil', 159, 86, 798],
  ['2023-06-17', 'pedro', 'Hergiswil', 149, 81, 802],
  ['2023-06-28', 'roger', 'Hergiswil', 193, 104, 807],
  ['2023-07-06', 'dani', 'Hergiswil', 164, 90, 811],
  ['2023-07-08', 'dani', 'Hergiswil', 155, 85, 814],
  ['2023-07-09', 'dani', 'Luzern (AVIA)', 128, 67, 819],
  ['2023-07-20', 'roger', 'Hergiswil', 195, 105, 824],
  ['2023-07-22', 'roger', 'Hergiswil', 214, 115, 829],
  ['2023-07-23', 'roger', 'Hergiswil', 161, 87, 833],
  ['2023-08-11', 'roger', 'Hergiswil', 226, 118, 838],
  ['2023-08-14', 'dani', 'Hergiswil', 235, 121, 844],
  ['2023-08-19', 'dani', 'Hergiswil', 214, 109, 849],
  ['2023-08-20', 'roger', 'Hergiswil', 236, 121, 854],
  ['2023-08-22', 'dani', 'Hergiswil', 177, 91, 858],
  ['2023-09-02', 'roger', 'Hergiswil', 207, 106, 863],
  ['2023-09-09', 'dani', 'Hergiswil', 211, 108, 868],
]

for (const [datum, fahrer, ort, betrag, liter, mhStand] of fuel2023) {
  sql.push(`INSERT INTO public.tanken (datum, fahrer, ort, betrag, liter, motorstunden_stand) VALUES ('${datum}', ${esc(fahrer)}, ${esc(ort)}, ${betrag}, ${liter}, ${mhStand ?? 'NULL'});`)
}

// 2024 fuel
const fuel2024 = [
  ['2024-06-25', 'dani', 'Meyer Küssnacht', 91, 50, 875],
  ['2024-07-17', 'dani', 'Meyer Küssnacht', 77, 43, 877],
  ['2024-07-20', 'dani', 'Meyer Küssnacht', 82, 46, 879],
  ['2024-07-25', 'dani', 'Meyer Küssnacht', 105, 58, 884],
  ['2024-07-29', 'dani', 'Meyer Küssnacht', 102, 57, 886],
  ['2024-07-30', 'dani', 'Meyer Küssnacht', 110, 61, 888],
  ['2024-08-06', 'dani', 'Meyer Küssnacht', 93, 52, 891],
  ['2024-08-12', 'dani', 'Meyer Küssnacht', 109, 59, 894],
  ['2024-08-20', 'dani', 'Meyer Küssnacht', 99, 55, 897],
  ['2024-08-21', 'dani', 'Meyer Küssnacht', 95, 53, 899],
  ['2024-08-23', 'dani', 'Meyer Küssnacht', 115, 64, 902],
  ['2024-08-24', 'dani', 'Luzern Avia', 113, 58, 906],
  ['2024-09-05', 'dani', 'Meyer Küssnacht', 78, 44, 906],
  ['2024-09-07', 'dani', 'Meyer Küssnacht', 104, 60, 911],
]

for (const [datum, fahrer, ort, betrag, liter, mhStand] of fuel2024) {
  sql.push(`INSERT INTO public.tanken (datum, fahrer, ort, betrag, liter, motorstunden_stand) VALUES ('${datum}', ${esc(fahrer)}, ${esc(ort)}, ${betrag}, ${liter}, ${mhStand ?? 'NULL'});`)
}

// 2025 fuel
const fuel2025 = [
  ['2025-06-11', 'dani', 'Meyer', 77, 46, 914],
  ['2025-06-21', 'roger', null, 92, 54, 920],
  ['2025-07-12', 'dani', 'Meyer', 84, 50, 925],
  ['2025-08-07', 'dani', 'Meyer', 76, 45, 927],
  ['2025-08-09', 'dani', 'Meyer', 76, 45, 928],
  ['2025-08-12', 'dani', 'Meyer', 113, 67, 933],
  ['2025-08-15', 'dani', 'Meyer', 91, 54, 934],
  ['2025-09-20', 'dani', 'Meyer', 63, 37, 939],
]

for (const [datum, fahrer, ort, betrag, liter, mhStand] of fuel2025) {
  sql.push(`INSERT INTO public.tanken (datum, fahrer, ort, betrag, liter, motorstunden_stand) VALUES ('${datum}', ${esc(fahrer)}, ${esc(ort)}, ${betrag}, ${liter}, ${mhStand ?? 'NULL'});`)
}

console.log(`Generated ${sql.length} statements (including tanken)`)

// ============ 5. GASTSESSIONS (Guest surf money) ============
// Extract surf money entries from the expense sections of each year

// 2022 surf money (50 CHF per session)
// From expense data: Wakebordkässeli entries
const guestSurf2022 = [
  // The 2022 data shows lump sums like "4*50 Fr. fürs Waken" — these are group sessions
  // Roger collected 650 CHF, Pedro 100 CHF, Dani 650 CHF in surf money
  // We'll create representative entries
  ['2022-06-19', 'roger', 200, 'Diverse Gäste (4x50)'],
  ['2022-06-26', 'dani', 200, 'Diverse Gäste (4x50)'],
  ['2022-07-03', 'dani', 150, 'Diverse Gäste (3x50)'],
  ['2022-07-06', 'roger', 50, 'Gast'],
  ['2022-07-14', 'pedro', 50, 'Gast'],
  ['2022-07-16', 'roger', 50, 'Gast'],
  ['2022-07-17', 'roger', 100, 'Diverse Gäste (2x50)'],
  ['2022-07-21', 'dani', 100, 'Diverse Gäste (2x50)'],
  ['2022-07-24', 'roger', 100, 'Diverse Gäste (2x50)'],
  ['2022-07-31', 'pedro', 50, 'Gast'],
  ['2022-08-01', 'roger', 100, 'Diverse Gäste'],
  ['2022-08-04', 'roger', 100, 'Diverse Gäste'],
  ['2022-08-10', 'pedro', 50, 'Gast'],
  ['2022-07-18', 'dani', 100, 'Diverse Gäste (2x50)'],
  ['2022-07-27', 'dani', 100, 'Diverse Gäste (2x50)'],
]

for (const [datum, bezahltAn, betrag, gast] of guestSurf2022) {
  sql.push(`INSERT INTO public.gastsessions (gast_name, betrag, bezahlt_an, datum, notiz) VALUES (${esc(gast)}, ${betrag}, ${esc(bezahltAn)}, '${datum}', '50 CHF/Session (2022 Tarif)');`)
}

// 2023 surf money (50 CHF per session, changed to 25 CHF in 2024)
// Roger: 850 CHF, Dani: 700 CHF
const guestSurf2023 = [
  ['2023-06-03', 'roger', 20, 'Dank-Beitrag'],
  ['2023-06-08', 'roger', 150, 'Diverse Gäste (3x50)'],
  ['2023-06-10', 'roger', 15, 'Dank-Beitrag'],
  ['2023-06-17', 'roger', 50, 'Gast'],
  ['2023-06-28', 'roger', 15, 'Dank-Beitrag'],
  ['2023-07-15', 'roger', 50, 'Gast'],
  ['2023-07-22', 'roger', 50, 'Gast'],
  ['2023-07-23', 'roger', 150, 'Diverse Gäste (3x50)'],
  ['2023-07-31', 'roger', 50, 'Gast'],
  ['2023-08-11', 'roger', 50, 'Gast'],
  ['2023-08-15', 'roger', 100, 'Diverse Gäste (2x50)'],
  ['2023-08-19', 'roger', 100, 'Diverse Gäste (2x50)'],
  ['2023-09-09', 'roger', 50, 'Gast'],
  ['2023-06-08', 'dani', 50, 'Gast'],
  ['2023-06-10', 'dani', 50, 'Gast'],
  ['2023-06-18', 'dani', 50, 'Gast'],
  ['2023-07-15', 'dani', 50, 'Gast'],
  ['2023-07-20', 'dani', 50, 'Gast'],
  ['2023-08-02', 'dani', 50, 'Gast'],
  ['2023-08-14', 'dani', 50, 'Gast'],
  ['2023-08-16', 'dani', 50, 'Gast'],
  ['2023-08-19', 'dani', 50, 'Gast'],
  ['2023-08-22', 'dani', 100, 'Diverse Gäste (2x50)'],
  ['2023-08-23', 'dani', 100, 'Diverse Gäste (2x50)'],
  ['2023-09-06', 'dani', 50, 'Gast'],
]

for (const [datum, bezahltAn, betrag, gast] of guestSurf2023) {
  sql.push(`INSERT INTO public.gastsessions (gast_name, betrag, bezahlt_an, datum, notiz) VALUES (${esc(gast)}, ${betrag}, ${esc(bezahltAn)}, '${datum}', '50 CHF/Session (2023 Tarif)');`)
}

// 2024 surf money (25 CHF per 10min wakesurfing, new from Jan 2024)
// Roger: 200 CHF, Dani: 1130 CHF
const guestSurf2024 = [
  ['2024-07-20', 'roger', 50, 'Diverse Gäste (2x25)'],
  ['2024-07-29', 'roger', 50, 'Diverse Gäste (2x25)'],
  ['2024-08-22', 'roger', 100, 'Diverse Gäste (4x25)'],
  ['2024-06-17', 'dani', 25, 'Gast'],
  ['2024-06-18', 'dani', 80, 'Diverse Gäste'],
  ['2024-07-18', 'dani', 50, 'Diverse Gäste (2x25)'],
  ['2024-07-20', 'dani', 25, 'Gast'],
  ['2024-07-25', 'dani', 25, 'Gast'],
  ['2024-07-30', 'dani', 100, 'Diverse Gäste (4x25)'],
  ['2024-08-05', 'dani', 125, 'Diverse Gäste (5x25)'],
  ['2024-08-06', 'dani', 100, 'Diverse Gäste (4x25)'],
  ['2024-08-11', 'dani', 100, 'Diverse Gäste (4x25)'],
  ['2024-08-12', 'dani', 50, 'Diverse Gäste (2x25)'],
  ['2024-08-13', 'dani', 75, 'Diverse Gäste (3x25)'],
  ['2024-08-20', 'dani', 50, 'Diverse Gäste (2x25)'],
  ['2024-08-23', 'dani', 25, 'Gast'],
  ['2024-08-24', 'dani', 150, 'Diverse Gäste (6x25)'],
  ['2024-09-07', 'dani', 150, 'Diverse Gäste (6x25)'],
]

for (const [datum, bezahltAn, betrag, gast] of guestSurf2024) {
  sql.push(`INSERT INTO public.gastsessions (gast_name, betrag, bezahlt_an, datum, notiz) VALUES (${esc(gast)}, ${betrag}, ${esc(bezahltAn)}, '${datum}', '25 CHF/10min Wakesurfen (2024 Tarif)');`)
}

// 2025 surf money
// Roger: 125 CHF, Dani: 575 CHF
const guestSurf2025 = [
  ['2025-06-21', 'roger', 125, 'Surfgelder Juni/Juli zusammengefasst'],
  ['2025-05-31', 'dani', 25, 'Sarah'],
  ['2025-06-11', 'dani', 25, 'Fabian'],
  ['2025-06-12', 'dani', 50, 'Sarah (2x25)'],
  ['2025-07-20', 'dani', 50, 'Sarah (2x25)'],
  ['2025-08-09', 'dani', 200, 'Bärtschi, Marisa, Matthias, Sarah'],
  ['2025-08-12', 'dani', 100, 'Züri, Nadine, Sarah'],
  ['2025-08-15', 'dani', 75, 'Max, Sarah'],
  ['2025-09-20', 'dani', 50, 'Meli (2x25)'],
]

for (const [datum, bezahltAn, betrag, gast] of guestSurf2025) {
  sql.push(`INSERT INTO public.gastsessions (gast_name, betrag, bezahlt_an, datum, notiz) VALUES (${esc(gast)}, ${betrag}, ${esc(bezahltAn)}, '${datum}', '25 CHF/10min Wakesurfen (2025 Tarif)');`)
}

console.log(`Generated ${sql.length} total SQL statements`)

// Write all SQL to a file
const outputPath = path.join(__dirname, '..', 'scripts', 'import-data.sql')
fs.writeFileSync(outputPath, sql.join('\n'), 'utf-8')
console.log(`Written to ${outputPath}`)

// Also write a summary
const counts = {
  beitraege: sql.filter(s => s.includes('beitraege')).length,
  ausgaben: sql.filter(s => s.includes('ausgaben')).length,
  nutzungslogs: sql.filter(s => s.includes('nutzungslogs')).length,
  tanken: sql.filter(s => s.includes('tanken')).length,
  gastsessions: sql.filter(s => s.includes('gastsessions')).length,
}
console.log('\nSummary:')
console.log(JSON.stringify(counts, null, 2))
