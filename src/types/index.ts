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
  erstattet: boolean
  erstattet_am: string | null
  notiz: string | null
  dokument_pfad: string | null
  verarbeitungs_status: 'neu' | 'verarbeitung' | 'fertig' | 'fehler' | null
  extraktion_daten: Record<string, unknown> | null
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
  auf_konto_eingezahlt: boolean
  eingezahlt_am: string | null
  eingezahlt_von: string | null
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

export interface Eigentuemer {
  id: string
  fahrer: string
  anteil_prozent: number
  einstieg_datum: string | null
  notiz: string | null
  erstellt_am: string
}

export interface AbrechnungConfig {
  id: string
  boot_marktwert: number
  bewertung_datum: string | null
  abschreibung_prozent: number
  kuendigungsfrist_monate: number
  beitrag_pro_monat: number
  notiz: string | null
  aktualisiert_am: string
}

export interface Wartung {
  id: string
  bezeichnung: string
  intervall_monate: number | null
  naechstes_datum: string | null
  zustaendig: string | null
  erledigt: boolean
  erledigt_am: string | null
  notiz: string | null
  erstellt_am: string
}

export interface Ferien {
  id: string
  fahrer: Fahrer
  von_datum: string
  bis_datum: string
  notiz: string | null
  erstellt_am: string
}

export interface GentlemanRule {
  id: string
  regel: string
  sortierung: number
  aktiv: boolean
  erstellt_am: string
}
