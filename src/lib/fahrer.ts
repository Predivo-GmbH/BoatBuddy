// Active fahrers (used in forms/dropdowns)
export const FAHRER = ['roger', 'dani'] as const
export type Fahrer = typeof FAHRER[number]

// All fahrers including historical (for display of old data)
export const ALLE_FAHRER = ['roger', 'dani', 'pedro'] as const
export type AlleFahrer = typeof ALLE_FAHRER[number]

export const FAHRER_LABELS: Record<AlleFahrer, string> = {
  roger: 'Roger',
  dani: 'Dani',
  pedro: 'Pedro',
}

export const FAHRER_FARBEN: Record<AlleFahrer, string> = {
  roger: 'bg-roger',
  dani: 'bg-dani',
  pedro: 'bg-pedro',
}

export const FAHRER_TEXT_FARBEN: Record<AlleFahrer, string> = {
  roger: 'text-roger',
  dani: 'text-dani',
  pedro: 'text-pedro',
}

export const FAHRER_BORDER_FARBEN: Record<AlleFahrer, string> = {
  roger: 'border-roger',
  dani: 'border-dani',
  pedro: 'border-pedro',
}

export const KATEGORIEN = [
  'bootskauf', 'bootsplatz', 'versicherung', 'verkehrssteuer', 'winterlager', 'fruehlingslager',
  'vorfuehren', 'treibstoff', 'material', 'reparatur', 'service', 'sonstiges'
] as const
export type Kategorie = typeof KATEGORIEN[number]

export const KATEGORIE_LABELS: Record<Kategorie, string> = {
  bootskauf: 'Bootskauf',
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
