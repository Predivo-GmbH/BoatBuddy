/**
 * Swiss public holidays (national + common cantonal).
 * Uses the Anonymous Gregorian Easter algorithm for moveable feasts.
 */

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function fmt(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface Feiertag {
  datum: string
  name: string
}

export function getFeiertage(year: number): Feiertag[] {
  const easter = easterSunday(year)

  return [
    { datum: `${year}-01-01`, name: 'Neujahr' },
    { datum: `${year}-01-02`, name: 'Berchtoldstag' },
    { datum: fmt(addDays(easter, -2)), name: 'Karfreitag' },
    { datum: fmt(easter), name: 'Ostersonntag' },
    { datum: fmt(addDays(easter, 1)), name: 'Ostermontag' },
    { datum: `${year}-05-01`, name: 'Tag der Arbeit' },
    { datum: fmt(addDays(easter, 39)), name: 'Auffahrt' },
    { datum: fmt(addDays(easter, 49)), name: 'Pfingstsonntag' },
    { datum: fmt(addDays(easter, 50)), name: 'Pfingstmontag' },
    { datum: `${year}-08-01`, name: 'Bundesfeiertag' },
    { datum: `${year}-12-25`, name: 'Weihnachten' },
    { datum: `${year}-12-26`, name: 'Stephanstag' },
  ]
}

/** Returns a Map of date string -> holiday name for quick lookup */
export function getFeiertageMap(year: number): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of getFeiertage(year)) {
    map.set(f.datum, f.name)
  }
  return map
}
