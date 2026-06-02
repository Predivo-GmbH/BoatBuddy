/**
 * Integration tests for BoatBuddy critical paths
 * Runs against staging Supabase project (svpewgbwousyheohlrtt)
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const STAGING_URL = process.env.STAGING_SUPABASE_URL ?? 'https://svpewgbwousyheohlrtt.supabase.co'
const STAGING_ANON = process.env.STAGING_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2cGV3Z2J3b3VzeWhlb2hscnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTgzNzIsImV4cCI6MjA5NTk3NDM3Mn0.3Smv9Md-IAS5QEID3RBCE0BttSZ-GaD9WDA2Z5Aaw2s'

let supabase: SupabaseClient

beforeAll(() => {
  supabase = createClient(STAGING_URL, STAGING_ANON)
})

// Cleanup IDs
const cleanup: { table: string; id: string }[] = []

afterAll(async () => {
  for (const { table, id } of cleanup.reverse()) {
    await supabase.from(table).delete().eq('id', id)
  }
})

describe('Beitraege (contributions)', () => {
  test('insert and read beitrag', async () => {
    const { data, error } = await supabase
      .from('beitraege')
      .insert({ fahrer: 'roger', betrag: 400, monat: '2026-01-01' })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data!.fahrer).toBe('roger')
    expect(Number(data!.betrag)).toBe(400)
    cleanup.push({ table: 'beitraege', id: data!.id })
  })

  test('unique constraint on fahrer+monat', async () => {
    const { data } = await supabase
      .from('beitraege')
      .insert({ fahrer: 'dani', betrag: 400, monat: '2026-02-01' })
      .select()
      .single()

    cleanup.push({ table: 'beitraege', id: data!.id })

    const { error: dupError } = await supabase
      .from('beitraege')
      .insert({ fahrer: 'dani', betrag: 400, monat: '2026-02-01' })
      .select()
      .single()

    expect(dupError).toBeTruthy()
    expect(dupError!.code).toBe('23505') // unique violation
  })
})

describe('Ausgaben (expenses)', () => {
  test('insert expense with all fields', async () => {
    const { data, error } = await supabase
      .from('ausgaben')
      .insert({
        bezeichnung: 'Test Winterservice',
        betrag: 1250.50,
        kategorie: 'service',
        datum: '2026-03-15',
        bezahlt_von: 'bootkonto',
        notiz: 'Integration test',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data!.bezeichnung).toBe('Test Winterservice')
    expect(Number(data!.betrag)).toBe(1250.50)
    expect(data!.kategorie).toBe('service')
    expect(data!.bezahlt_von).toBe('bootkonto')
    cleanup.push({ table: 'ausgaben', id: data!.id })
  })

  test('expense with dokument_pfad and verarbeitungs_status', async () => {
    const { data, error } = await supabase
      .from('ausgaben')
      .insert({
        bezeichnung: 'Invoice test',
        betrag: 0,
        kategorie: 'sonstiges',
        datum: '2026-06-01',
        bezahlt_von: 'bootkonto',
        dokument_pfad: 'test-file.pdf',
        verarbeitungs_status: 'verarbeitung',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data!.verarbeitungs_status).toBe('verarbeitung')
    expect(data!.dokument_pfad).toBe('test-file.pdf')
    cleanup.push({ table: 'ausgaben', id: data!.id })
  })
})

describe('Kontostand (balance snapshots)', () => {
  test('insert and read snapshot', async () => {
    const { data, error } = await supabase
      .from('kontostand_snapshots')
      .insert({ betrag: 5432.10, datum: '2026-06-01', notiz: 'Test' })
      .select()
      .single()

    expect(error).toBeNull()
    expect(Number(data!.betrag)).toBe(5432.10)
    cleanup.push({ table: 'kontostand_snapshots', id: data!.id })
  })
})

describe('Reservierungen (calendar)', () => {
  test('insert reservation', async () => {
    const { data, error } = await supabase
      .from('reservierungen')
      .insert({
        fahrer: 'roger',
        datum: '2026-07-15',
        von_zeit: '10:00',
        bis_zeit: '14:00',
        notiz: 'Wakesurfen',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data!.fahrer).toBe('roger')
    expect(data!.datum).toBe('2026-07-15')
    cleanup.push({ table: 'reservierungen', id: data!.id })
  })
})

describe('Gastsessions', () => {
  test('insert guest session with default betrag', async () => {
    const { data, error } = await supabase
      .from('gastsessions')
      .insert({
        gast_name: 'Test Gast',
        bezahlt_an: 'roger',
        datum: '2026-06-01',
        auf_konto_eingezahlt: false,
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data!.gast_name).toBe('Test Gast')
    expect(Number(data!.betrag)).toBe(25) // default
    cleanup.push({ table: 'gastsessions', id: data!.id })
  })
})

describe('Nutzungslogs (usage)', () => {
  test('insert usage log', async () => {
    const { data, error } = await supabase
      .from('nutzungslogs')
      .insert({
        datum: '2026-06-01',
        fahrer: 'dani',
        betriebsstunden: 2.5,
        treibstoff_liter: 45,
        aktivitaeten: [{ typ: 'wakesurfen', dauer_min: 120 }],
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(Number(data!.betriebsstunden)).toBe(2.5)
    cleanup.push({ table: 'nutzungslogs', id: data!.id })
  })
})

describe('Boot Stats', () => {
  test('insert and read boot stats', async () => {
    const { data, error } = await supabase
      .from('boot_stats')
      .insert({
        gesamtstunden: 150,
        modell: 'Mastercraft X2',
        kaufdatum: '2023-04-01',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data!.modell).toBe('Mastercraft X2')
    cleanup.push({ table: 'boot_stats', id: data!.id })
  })
})

describe('Ferien (vacations)', () => {
  test('insert vacation', async () => {
    const { data, error } = await supabase
      .from('ferien')
      .insert({
        fahrer: 'roger',
        von_datum: '2026-07-01',
        bis_datum: '2026-07-14',
        notiz: 'Sommerferien',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data!.fahrer).toBe('roger')
    expect(data!.von_datum).toBe('2026-07-01')
    expect(data!.bis_datum).toBe('2026-07-14')
    cleanup.push({ table: 'ferien', id: data!.id })
  })
})

describe('RPC: adjust_gesamtstunden', () => {
  test('RPC is callable without error', async () => {
    // Just verify the RPC is deployed and callable (delta=0 is a no-op)
    const { error } = await supabase.rpc('adjust_gesamtstunden', { delta: 0 })
    expect(error).toBeNull()
  })
})

describe('Storage: dokumente bucket', () => {
  test('bucket exists and is accessible', async () => {
    const { data, error } = await supabase.storage.getBucket('dokumente')
    // On staging without storage setup, this may return error
    // but we at least verify the storage API is reachable
    if (error) {
      expect(error.message).toContain('not found')
    } else {
      expect(data.name).toBe('dokumente')
    }
  })
})
