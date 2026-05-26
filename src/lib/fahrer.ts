export const FAHRER = ['roger', 'dani', 'jan'] as const
export type Fahrer = typeof FAHRER[number]

export const FAHRER_LABELS: Record<Fahrer, string> = {
  roger: 'Roger',
  dani: 'Dani',
  jan: 'Jan',
}

export const FAHRER_FARBEN: Record<Fahrer, string> = {
  roger: 'bg-accent',
  dani: 'bg-blue-500',
  jan: 'bg-orange-500',
}

export const FAHRER_TEXT_FARBEN: Record<Fahrer, string> = {
  roger: 'text-accent',
  dani: 'text-blue-500',
  jan: 'text-orange-500',
}

export const KATEGORIEN = [
  'service', 'treibstoff', 'versicherung', 'lagerung', 'reparatur', 'sonstiges'
] as const
export type Kategorie = typeof KATEGORIEN[number]

export const KATEGORIE_LABELS: Record<Kategorie, string> = {
  service: 'Service',
  treibstoff: 'Treibstoff',
  versicherung: 'Versicherung',
  lagerung: 'Lagerung',
  reparatur: 'Reparatur',
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
