// Active fahrers (used in forms/dropdowns)
export const FAHRER = ['roger', 'dani', 'jan'] as const
export type Fahrer = typeof FAHRER[number]

// All fahrers including historical (for display of old data)
export const ALLE_FAHRER = ['roger', 'dani', 'jan', 'pedro'] as const
export type AlleFahrer = typeof ALLE_FAHRER[number]

export const FAHRER_LABELS: Record<AlleFahrer, string> = {
  roger: 'Roger',
  dani: 'Dani',
  jan: 'Jan',
  pedro: 'Pedro',
}

export const FAHRER_FARBEN: Record<AlleFahrer, string> = {
  roger: 'bg-accent',
  dani: 'bg-blue-500',
  jan: 'bg-orange-500',
  pedro: 'bg-purple-500',
}

export const FAHRER_TEXT_FARBEN: Record<AlleFahrer, string> = {
  roger: 'text-accent',
  dani: 'text-blue-500',
  jan: 'text-orange-500',
  pedro: 'text-purple-500',
}

export const KATEGORIEN = [
  'bootsplatz', 'versicherung', 'verkehrssteuer', 'winterlager', 'fruehlingslager',
  'vorfuehren', 'treibstoff', 'material', 'reparatur', 'service', 'sonstiges'
] as const
export type Kategorie = typeof KATEGORIEN[number]

export const KATEGORIE_LABELS: Record<Kategorie, string> = {
  bootsplatz: 'Bootsplatz',
  versicherung: 'Versicherung',
  verkehrssteuer: 'Verkehrssteuer',
  winterlager: 'Winterlager',
  fruehlingslager: 'Frühlingslager',
  vorfuehren: 'Vorführen',
  treibstoff: 'Treibstoff',
  material: 'Material',
  reparatur: 'Reparatur',
  service: 'Service',
  sonstiges: 'Sonstiges',
}

export const AKTIVITAET_TYPEN = [
  'wakesurfen', 'wakeboarden', 'cruisen', 'sonstiges'
] as const
export type AktivitaetTyp = typeof AKTIVITAET_TYPEN[number]

export const AKTIVITAET_LABELS: Record<AktivitaetTyp, string> = {
  wakesurfen: 'Wakesurfen',
  wakeboarden: 'Wakeboarden',
  cruisen: 'Cruisen',
  sonstiges: 'Sonstiges',
}
