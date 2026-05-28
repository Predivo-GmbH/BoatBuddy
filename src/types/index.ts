import type { AlleFahrer, Fahrer, Kategorie, AktivitaetTyp } from '@/lib/fahrer'

export interface Beitrag {
  id: string
  fahrer: AlleFahrer
  betrag: number
  monat: string
  notiz: string | null
  erstellt_am: string
}

export interface KontostandSnapshot {
  id: string
  betrag: number
  datum: string
  notiz: string | null
  erstellt_am: string
}

export interface Ausgabe {
  id: string
  bezeichnung: string
  betrag: number
  kategorie: Kategorie
  datum: string
  bezahlt_von: string
  notiz: string | null
  erstellt_am: string
}

export interface Reservierung {
  id: string
  fahrer: Fahrer
  datum: string
  ganzer_tag: boolean
  von_zeit: string | null
  bis_zeit: string | null
  notiz: string | null
  erstellt_am: string
}

export interface Gastsession {
  id: string
  gast_name: string
  betrag: number
  bezahlt_an: AlleFahrer
  datum: string
  notiz: string | null
  erstellt_am: string
}

export interface Aktivitaet {
  typ: AktivitaetTyp
  dauer_min: number
}

export interface Nutzungslog {
  id: string
  datum: string
  fahrer: AlleFahrer
  betriebsstunden: number
  treibstoff_liter: number | null
  aktivitaeten: Aktivitaet[]
  teilnehmer: AlleFahrer[]
  motorstunden_stand: number | null
  notiz: string | null
  erstellt_am: string
}

export interface BootStats {
  id: string
  gesamtstunden: number
  kaufdatum: string | null
  modell: string | null
  motorstunden_grenze: number | null
  notiz: string | null
  aktualisiert_am: string
}
