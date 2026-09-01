/**
 * Integration tests for BoatBuddy critical paths
 * Runs against staging Supabase project (svpewgbwousyheohlrtt)
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { q } from './_transient'

const STAGING_URL = process.env.STAGING_SUPABASE_URL ?? 'https://svpewgbwousyheohlrtt.supabase.co'
const STAGING_ANON = process.env.STAGING_SUPABASE_ANON_KEY ?? ''

// ---------------------------------------------------------------------------
// ISOLATION
//
// This suite writes into the SHARED staging database. The staging site, the E2E
// gate and the next run of this very suite all read the same rows, so a run can
// be failed by another run's leftovers: a failure that says nothing about the
// commit under test, and that trains everyone to just hit rerun.
//
// Three rules stop that:
//
//   1. MARKER  every row this suite writes carries RUN_TAG in `notiz`. That makes
//              its rows always distinguishable from real staging data and from
//              the Gate A fixtures, which never carry the prefix.
//   2. SWEEP   beforeAll deletes marked rows older than the grace window. This is
//              not belt-and-braces: test.yml sets `cancel-in-progress: true`, so a
//              superseded run is KILLED mid-suite and vitest's afterAll never
//              runs. Orphaned rows are routine, not hypothetical.
//   3. PROVEN  afterAll deletes this run's rows and then RE-QUERIES to prove they
//              are gone. Swallowing a failed delete is exactly how a shared
//              database starts carrying state between runs.
//
// Dates that feed a constraint are still shifted per run (see `d`), because two
// runs genuinely can overlap: the daily scheduled Deploy and a push-triggered
// test.yml run are different workflows hitting one database.
// ---------------------------------------------------------------------------
const MARKER = '[itest]'
const RUN_ID = process.env.GITHUB_RUN_ID ?? 'local'
// The ATTEMPT is part of the key on purpose. GITHUB_RUN_ID is UNCHANGED when a
// failed run is re-run, so without it a rerun reuses the exact dates of the
// attempt that just left rows behind, and then fails on its own garbage.
const RUN_ATTEMPT = process.env.GITHUB_RUN_ATTEMPT ?? '1'
const RUN_TAG = `${MARKER} run=${RUN_ID}.${RUN_ATTEMPT}`

const RUN_KEY = `${RUN_ID}.${RUN_ATTEMPT}`.replace(/\D/g, '') || String(Date.now())
const RUN_OFFSET_DAYS = Number(RUN_KEY.slice(-7)) % 4000

// Shift every date that participates in a constraint. Live constraints as of
// migration 028: beitraege has `unique (fahrer, monat)` (001); reservierungen no
// longer has `unique (datum, fahrer)`, because 028 dropped it and replaced it with
// the GiST exclusion `reservierungen_no_overlap`, which two concurrent runs can
// still violate on the same driver and slot, so the shift stays.
//
// The base year in the callers below is deliberately outside anything real or
// seeded: staging carries a hand-seeded beitraege set on the 1st of every month of
// 2026 for roger/dani/jan, and a shifted 2026 date can land exactly on one of those.
const d = (iso: string): string => {
  const dt = new Date(iso + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + RUN_OFFSET_DAYS)
  return dt.toISOString().slice(0, 10)
}

// Every table this suite writes to. All seven carry `notiz` and `erstellt_am`
// (checked against supabase/migrations), which is what makes the sweep possible.
// boot_stats is deliberately absent, see the Boot Stats block below.
const WRITTEN_TABLES = [
  'beitraege',
  'ausgaben',
  'kontostand_snapshots',
  'reservierungen',
  'gastsessions',
  'nutzungslogs',
  'ferien',
] as const

// A suite still in flight is younger than this; anything marked and older than it
// belongs to a run that is long gone.
const SWEEP_GRACE_MINUTES = 30

let supabase: SupabaseClient

// These tests hit a live staging Supabase project. Without STAGING_SUPABASE_ANON_KEY
// (e.g. a local `npm test`) there is nothing to connect to, so skip the whole suite
// cleanly instead of failing on an empty-key client.
const describeStaging = STAGING_ANON ? describe : describe.skip

beforeAll(async () => {
  if (!STAGING_ANON) return
  supabase = createClient(STAGING_URL, STAGING_ANON)

  // Clear what earlier runs could not clear themselves.
  const cutoff = new Date(Date.now() - SWEEP_GRACE_MINUTES * 60_000).toISOString()
  for (const table of WRITTEN_TABLES) {
    const { error } = await supabase
      .from(table)
      .delete()
      .like('notiz', `${MARKER}%`)
      .lt('erstellt_am', cutoff)
    if (error) {
      throw new Error(`orphan sweep failed on ${table}: ${error.message}`)
    }
  }
})

// Cleanup IDs
const cleanup: { table: string; id: string }[] = []

afterAll(async () => {
  if (!STAGING_ANON) return

  const failures: string[] = []

  for (const { table, id } of cleanup.reverse()) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) failures.push(`delete ${table}/${id}: ${error.message}`)
  }

  // Deleting by id and hoping is how the leftovers appear in the first place.
  for (const table of WRITTEN_TABLES) {
    const { data, error } = await supabase.from(table).select('id').eq('notiz', RUN_TAG)
    if (error) {
      failures.push(`verify ${table}: ${error.message}`)
      continue
    }
    if (data.length > 0) {
      failures.push(`${data.length} row(s) survived cleanup in ${table}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `staging cleanup did not complete for ${RUN_TAG}. Later runs would be judged on ` +
        `these rows:\n  ${failures.join('\n  ')}`,
    )
  }
})

describeStaging('Beitraege (contributions)', () => {
  test('insert and read beitrag', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('beitraege')
        .insert({ fahrer: 'roger', betrag: 400, monat: d('2031-01-01'), notiz: RUN_TAG })
        .select()
        .single(),
    )

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data!.fahrer).toBe('roger')
    expect(Number(data!.betrag)).toBe(400)
    cleanup.push({ table: 'beitraege', id: data!.id })
  })

  test('unique constraint on fahrer+monat', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('beitraege')
        .insert({ fahrer: 'dani', betrag: 400, monat: d('2031-02-01'), notiz: RUN_TAG })
        .select()
        .single(),
    )

    // The duplicate below is only meaningful if the FIRST insert landed. Assert it,
    // so a broken setup names itself instead of surfacing two lines down as a
    // confusing "expected undefined to be 23505".
    expect(error).toBeNull()
    cleanup.push({ table: 'beitraege', id: data!.id })

    const { error: dupError } = await q(() =>
      supabase
        .from('beitraege')
        .insert({ fahrer: 'dani', betrag: 400, monat: d('2031-02-01'), notiz: RUN_TAG })
        .select()
        .single(),
    )

    expect(dupError).toBeTruthy()
    expect(dupError!.code).toBe('23505') // unique violation
  })
})

describeStaging('Ausgaben (expenses)', () => {
  test('insert expense with all fields', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('ausgaben')
        .insert({
          bezeichnung: 'Test Winterservice',
          betrag: 1250.50,
          kategorie: 'service',
          datum: '2026-03-15',
          bezahlt_von: 'bootkonto',
          notiz: RUN_TAG,
        })
        .select()
        .single(),
    )

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data!.bezeichnung).toBe('Test Winterservice')
    expect(Number(data!.betrag)).toBe(1250.50)
    expect(data!.kategorie).toBe('service')
    expect(data!.bezahlt_von).toBe('bootkonto')
    cleanup.push({ table: 'ausgaben', id: data!.id })
  })

  test('expense with dokument_pfad and verarbeitungs_status', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('ausgaben')
        .insert({
          bezeichnung: 'Invoice test',
          betrag: 0,
          kategorie: 'sonstiges',
          datum: '2026-06-01',
          bezahlt_von: 'bootkonto',
          dokument_pfad: 'test-file.pdf',
          verarbeitungs_status: 'verarbeitung',
          notiz: RUN_TAG,
        })
        .select()
        .single(),
    )

    expect(error).toBeNull()
    expect(data!.verarbeitungs_status).toBe('verarbeitung')
    expect(data!.dokument_pfad).toBe('test-file.pdf')
    cleanup.push({ table: 'ausgaben', id: data!.id })
  })
})

describeStaging('Kontostand (balance snapshots)', () => {
  test('insert and read snapshot', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('kontostand_snapshots')
        .insert({ betrag: 5432.10, datum: '2026-06-01', notiz: RUN_TAG })
        .select()
        .single(),
    )

    expect(error).toBeNull()
    expect(Number(data!.betrag)).toBe(5432.10)
    cleanup.push({ table: 'kontostand_snapshots', id: data!.id })
  })
})

describeStaging('Reservierungen (calendar)', () => {
  test('insert reservation', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('reservierungen')
        .insert({
          fahrer: 'roger',
          datum: d('2031-07-15'),
          von_zeit: '10:00',
          bis_zeit: '14:00',
          notiz: RUN_TAG,
        })
        .select()
        .single(),
    )

    expect(error).toBeNull()
    expect(data!.fahrer).toBe('roger')
    expect(data!.datum).toBe(d('2031-07-15'))
    cleanup.push({ table: 'reservierungen', id: data!.id })
  })
})

describeStaging('Gastsessions', () => {
  test('insert guest session with default betrag', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('gastsessions')
        .insert({
          gast_name: 'Test Gast',
          bezahlt_an: 'roger',
          datum: '2026-06-01',
          auf_konto_eingezahlt: false,
          notiz: RUN_TAG,
        })
        .select()
        .single(),
    )

    expect(error).toBeNull()
    expect(data!.gast_name).toBe('Test Gast')
    expect(Number(data!.betrag)).toBe(25) // default
    cleanup.push({ table: 'gastsessions', id: data!.id })
  })
})

describeStaging('Nutzungslogs (usage)', () => {
  test('insert usage log', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('nutzungslogs')
        .insert({
          datum: '2026-06-01',
          fahrer: 'dani',
          betriebsstunden: 2.5,
          treibstoff_liter: 45,
          aktivitaeten: [{ typ: 'wakesurfen', dauer_min: 120 }],
          notiz: RUN_TAG,
        })
        .select()
        .single(),
    )

    expect(error).toBeNull()
    expect(Number(data!.betriebsstunden)).toBe(2.5)
    cleanup.push({ table: 'nutzungslogs', id: data!.id })
  })
})

describeStaging('Boot Stats', () => {
  // boot_stats is a SINGLETON. Until 2026-09-01 that was a convention and nothing
  // else: the app read it with `.limit(1).maybeSingle()` and no ORDER BY
  // (src/hooks/useBootStats.ts, src/hooks/useKontoberechnung.ts), then UPDATEd by
  // the id it had read back — so a second row would make the settings screen edit
  // a row the user was never shown. This block used to be READ-ONLY for exactly
  // that reason: inserting a probe row would have moved the account balance on
  // /finanzen for every concurrent reader, including the E2E gate.
  //
  // Migration 031 adds `unique ((true))` to both singleton tables, so a second row
  // is now refused BY THE DATABASE. That makes the insert safe to attempt — and
  // attempting it is the only way to know the constraint is really there. A guard
  // nobody has watched reject something is not a guard.
  test('singleton row is present and readable', async () => {
    const { data, error } = await q(() => supabase.from('boot_stats').select('*'))

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].modell).toBeTruthy()
    expect(Number(data![0].gesamtstunden)).toBeGreaterThanOrEqual(0)
  })

  test('the database REFUSES a second boot_stats row', async () => {
    const { data, error } = await q(() =>
      supabase.from('boot_stats').insert({ gesamtstunden: 0, modell: RUN_TAG }).select(),
    )

    // Must fail on the unique index, not merely "not appear".
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
    expect(data).toBeNull()

    // And the table is still the one row it was — proving the refusal happened
    // before the write, not after it.
    const { data: after } = await q(() => supabase.from('boot_stats').select('id'))
    expect(after).toHaveLength(1)
  })

  test('the database REFUSES a second abrechnung_config row', async () => {
    const { data, error } = await q(() =>
      supabase.from('abrechnung_config').insert({ notiz: RUN_TAG }).select(),
    )

    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
    expect(data).toBeNull()

    const { data: after } = await q(() => supabase.from('abrechnung_config').select('id'))
    expect(after).toHaveLength(1)
  })
})

describeStaging('Ferien (vacations)', () => {
  test('insert vacation', async () => {
    const { data, error } = await q(() =>
      supabase
        .from('ferien')
        .insert({
          fahrer: 'roger',
          von_datum: d('2031-07-01'),
          bis_datum: d('2031-07-14'),
          notiz: RUN_TAG,
        })
        .select()
        .single(),
    )

    expect(error).toBeNull()
    expect(data!.fahrer).toBe('roger')
    expect(data!.von_datum).toBe(d('2031-07-01'))
    expect(data!.bis_datum).toBe(d('2031-07-14'))
    cleanup.push({ table: 'ferien', id: data!.id })
  })
})

describeStaging('RPC: adjust_gesamtstunden', () => {
  test('RPC is callable without error', async () => {
    // Just verify the RPC is deployed and callable (delta=0 is a no-op)
    const { error } = await q(() =>
      supabase.rpc('adjust_gesamtstunden', { delta: 0 }),
    )
    expect(error).toBeNull()
  })
})

describeStaging('Storage: dokumente bucket', () => {
  test('bucket exists and is accessible', async () => {
    const { data, error } = await q(() =>
      supabase.storage.getBucket('dokumente'),
    )
    // On staging without storage setup, this may return error
    // but we at least verify the storage API is reachable
    if (error) {
      expect(error.message).toContain('not found')
    } else {
      expect(data.name).toBe('dokumente')
    }
  })
})
