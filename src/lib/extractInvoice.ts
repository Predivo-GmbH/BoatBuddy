import { supabase } from '@/lib/supabase'
import type { Kategorie } from '@/lib/fahrer'
import { DEFAULT_MEANWHILE, UserFacingError } from '@/lib/server-error'

/** The "In der Zwischenzeit" line after a failed receipt upload or reading: true in both cases. */
export function receiptMeanwhile(storagePath: string | null): string {
  return storagePath
    ? 'Du kannst die Ausgabe von Hand erfassen, der Beleg ist schon angehängt.'
    : DEFAULT_MEANWHILE
}

/**
 * Draft-in-memory invoice extraction.
 *
 * The receipt file is uploaded to storage and the AI reads it, but NOTHING is
 * written to the `ausgaben` table here. The caller holds the returned draft and
 * only inserts a row when the user clicks Speichern. This is what guarantees
 * "nothing is saved unless you press Save".
 */

export interface ExtractedInvoice {
  bezeichnung?: string | null
  betrag?: number | null
  datum?: string | null
  kategorie?: Kategorie | null
  liter?: number | null
  notiz?: string | null
  confidence?: number | null
}

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export function validateReceiptFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Nur PDF, JPG, PNG oder WebP Dateien erlaubt'
  if (file.size > MAX_FILE_SIZE) return 'Datei zu gross (max. 10 MB)'
  return null
}

/** Upload a receipt to the `dokumente` bucket. Returns the storage path. */
export async function uploadReceipt(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const storagePath = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('dokumente')
    .upload(storagePath, file, { contentType: file.type })
  if (error) throw new Error(`Upload fehlgeschlagen: ${error.message}`)
  return storagePath
}

/**
 * Remove a receipt that was uploaded to `dokumente` but never committed to an
 * ausgaben row (dialog abandoned before Speichern). Best-effort — the caller
 * ignores failures. NEVER call this for a file that was already saved.
 */
export async function removeReceipt(storagePath: string): Promise<void> {
  await supabase.storage.from('dokumente').remove([storagePath])
}

/**
 * Run AI extraction on an already-uploaded document. Calls extract-expense
 * WITHOUT an ausgabe_id, so the function returns the JSON without touching the
 * DB. Awaits the two-pass extraction synchronously (no polling).
 */
export async function extractFromStorage(storagePath: string): Promise<ExtractedInvoice> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new UserFacingError('Bitte lade die Seite neu und melde dich erneut an.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000) // 2 min ceiling
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/extract-expense`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ storage_path: storagePath }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      // For the error report only (lib/server-error.ts); the screen never shows this text.
      throw Object.assign(new Error(`AI-Extraktion fehlgeschlagen (${res.status})${body ? `: ${body.slice(0, 120)}` : ''}`), { status: res.status })
    }
    const json = await res.json()
    return (json?.extracted ?? {}) as ExtractedInvoice
  } finally {
    clearTimeout(timeout)
  }
}

/** Upload + extract in one step (used by the desktop dropzone / in-dialog upload). */
export async function uploadAndExtract(
  file: File,
): Promise<{ storagePath: string; extracted: ExtractedInvoice }> {
  const storagePath = await uploadReceipt(file)
  const extracted = await extractFromStorage(storagePath)
  return { storagePath, extracted }
}
