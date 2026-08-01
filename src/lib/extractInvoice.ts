import { supabase } from '@/lib/supabase'
import type { Kategorie } from '@/lib/fahrer'

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
 * Run AI extraction on an already-uploaded document. Calls extract-expense
 * WITHOUT an ausgabe_id, so the function returns the JSON without touching the
 * DB. Awaits the two-pass extraction synchronously (no polling).
 */
export async function extractFromStorage(storagePath: string): Promise<ExtractedInvoice> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  // Shared secret gating the AI-cost DoS guard in the edge fn. Only sent when
  // provisioned as a build var; when unset the fn allows the call (backward-compatible).
  const extractSecret = import.meta.env.VITE_EXTRACT_SECRET

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000) // 2 min ceiling
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/extract-expense`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
        ...(extractSecret ? { 'x-extract-secret': extractSecret } : {}),
      },
      body: JSON.stringify({ storage_path: storagePath }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`AI-Extraktion fehlgeschlagen (${res.status})${body ? `: ${body.slice(0, 120)}` : ''}`)
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
