import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { encode as encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { anthropicMessages } from '../_shared/anthropic-model.ts'
import { logAnthropicUsage } from '../_shared/log-usage.ts'

/**
 * extract-expense: AI-powered invoice extraction for BoatBuddy
 *
 * POST /extract-expense
 * Body: { ausgabe_id: string, storage_path: string }
 *
 * Pipeline:
 * 1. Download document from Supabase Storage (dokumente bucket)
 * 2. Two-pass AI extraction (Vision → Text → JSON)
 * 3. Update ausgaben record with extracted data
 */

// Model + PROVIDER come from the fleet secrets via _shared/anthropic-model.ts:
// AI_PROVIDER (anthropic|kimi), AI_FALLBACK_PROVIDER, AI_MODEL_FAST / KIMI_MODEL_FAST.
const AI_TIER = 'fast' as const

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Model API call, routed through the fleet provider layer: primary provider, automatic
 * failover to AI_FALLBACK_PROVIDER on ANY failure (incl. Kimi rejecting a PDF `document`
 * block → falls back to Anthropic), thinking-disabled forced for Kimi, model-retirement
 * substitution, and 429/5xx handling — all inside anthropicMessages. `body` must NOT
 * contain `model`. `_label` is retained for call-site compatibility.
 */
async function anthropicCall(
  apiKey: string,
  body: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _label: string,
): Promise<Response> {
  return await anthropicMessages(apiKey, AI_TIER, body)
}

const BOAT_CATEGORIES = [
  'bootskauf', 'bootsplatz', 'versicherung', 'verkehrssteuer', 'winterlager', 'fruehlingslager',
  'vorfuehren', 'treibstoff', 'material', 'reparatur', 'service', 'sonstiges',
] as const

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  bootskauf: ['bootskauf', 'bootkauf', 'kaufvertrag', 'ankauf'],
  bootsplatz: ['bootsplatz', 'platz', 'hafen', 'liegeplatz', 'hafengebühr'],
  versicherung: ['versicherung', 'axa', 'police', 'prämie', 'deckung'],
  verkehrssteuer: ['verkehrsamt', 'verkehrssteuer', 'steuer', 'schifffahrt', 'wasserfzg'],
  winterlager: ['winterlager', 'winter', 'einwintern'],
  fruehlingslager: ['frühlingslager', 'fruehlingslager', 'frühling', 'auswintern', 'mmc'],
  vorfuehren: ['vorführen', 'vorfuehren', 'kontrolle', 'schiffskontrolle', 'prüfung'],
  treibstoff: ['treibstoff', 'benzin', 'diesel', 'tanken', 'tankstelle', 'fuel'],
  material: ['material', 'blache', 'zubehör', 'ersatzteil'],
  reparatur: ['reparatur', 'reparieren', 'defekt'],
  service: ['service', 'wartung', 'ölwechsel', 'werft'],
}

function suggestCategory(text: string): string {
  const lower = text.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return category
  }
  return 'sonstiges'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // Auth: the Supabase Edge gateway already enforces verify_jwt — it rejects any
  // request without a valid project key (anon JWT or publishable key) before it
  // reaches this handler. We only require an apikey/authorization header to be
  // present. Do NOT compare against a hardcoded SUPABASE_ANON_KEY value: that env
  // flips to the publishable key under the new API-key system and no longer matches
  // the legacy anon JWT the frontend sends (broke 2026-06-02).
  const apiKey = req.headers.get('apikey') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { ausgabe_id, storage_path } = await req.json()
    if (!ausgabe_id || !storage_path) {
      return new Response(JSON.stringify({ error: 'ausgabe_id and storage_path required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Download document from Storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from('dokumente')
      .download(storage_path)

    if (dlError || !fileData) {
      throw new Error(`Download failed: ${dlError?.message ?? 'no data'}`)
    }

    const buffer = await fileData.arrayBuffer()
    const base64 = encodeBase64(new Uint8Array(buffer))
    const isPdf = storage_path.toLowerCase().endsWith('.pdf')
    const mediaType = isPdf ? 'application/pdf' : (
      storage_path.toLowerCase().endsWith('.png') ? 'image/png' :
      storage_path.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    )

    // 2. Pass 1: Vision → Text transcription
    const pass1Response = await anthropicCall(anthropicKey, {
        max_tokens: 4096,
        temperature: 0,
        system: `You are a precise document transcription engine. Transcribe ALL text visible on this document exactly as it appears. Organize by sections (header, recipient, details, line items, totals, payment terms, QR bill, footer). Preserve exact formatting of numbers, dates, amounts, IBANs. Do NOT interpret or summarize — just transcribe.`,
        messages: [{
          role: 'user',
          content: [{
            type: isPdf ? 'document' : 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
            ...(isPdf ? { cache_control: { type: 'ephemeral' } } : {}),
          }, {
            type: 'text',
            text: 'Transcribe all text from this document.',
          }],
        }],
      }, 'Pass1-Vision')

    if (!pass1Response.ok) {
      const errBody = await pass1Response.text()
      throw new Error(`Pass 1 failed: ${pass1Response.status} ${errBody}`)
    }

    const pass1Result = await pass1Response.json()
    await logAnthropicUsage('BoatBuddy', 'extract-expense', pass1Result)
    const transcription = pass1Result.content?.[0]?.text ?? ''

    if (!transcription || transcription.length < 20) {
      throw new Error('Pass 1 produced empty transcription')
    }

    // 3. Pass 2: Text → Structured JSON
    const pass2Response = await anthropicCall(anthropicKey, {
        max_tokens: 2048,
        temperature: 0,
        system: `You extract structured data from Swiss invoices/receipts related to a shared wake-surfing boat (Mastercraft X2).

Extract ONLY what is present in the text. Return valid JSON with these fields:
{
  "bezeichnung": "Short description of the expense (e.g. 'AXA Versicherung 2025', 'Winterlagerpaket')",
  "betrag": 1234.56,
  "datum": "2025-01-15",
  "kategorie": "one of: bootskauf, bootsplatz, versicherung, verkehrssteuer, winterlager, fruehlingslager, vorfuehren, treibstoff, material, reparatur, service, sonstiges",
  "liter": 50.0,
  "notiz": "Any additional relevant details (bill number, reference, etc.)",
  "confidence": 0.95
}

Rules:
- "betrag" = total amount to pay (including VAT if present). Use the final "Total" or "Zahlbar" amount.
- "datum" = invoice date (Rechnungsdatum, Datum), NOT due date
- "kategorie" = best match from the boat expense categories listed above
- "bezeichnung" = concise description (supplier name + what it's for)
- "liter" = ONLY for fuel/Tankstelle receipts: the number of litres filled (e.g. "50.00L", "Menge 48.2 L"). Use null for any non-fuel document.
- If a field is not found, use null
- "confidence" = your overall confidence in the extraction (0.0-1.0)

Return ONLY the JSON object, no markdown, no explanation.`,
        messages: [{
          role: 'user',
          content: `Here is the transcribed text from a boat-related invoice:\n\n${transcription}\n\nExtract the structured data as JSON.`,
        }],
      }, 'Pass2-Extract')

    if (!pass2Response.ok) {
      const errBody = await pass2Response.text()
      throw new Error(`Pass 2 failed: ${pass2Response.status} ${errBody}`)
    }

    const pass2Result = await pass2Response.json()
    await logAnthropicUsage('BoatBuddy', 'extract-expense', pass2Result)
    const extractionText = pass2Result.content?.[0]?.text ?? ''

    // Parse JSON from AI response
    let extracted: Record<string, unknown>
    try {
      // Strip markdown fences if present
      const cleaned = extractionText.replace(/```json?\s*\n?/g, '').replace(/```\s*$/g, '').trim()
      extracted = JSON.parse(cleaned)
    } catch {
      throw new Error(`Failed to parse extraction JSON: ${extractionText.slice(0, 200)}`)
    }

    // Apply keyword-based category suggestion as fallback
    if (!extracted.kategorie || extracted.kategorie === 'sonstiges') {
      const text = `${extracted.bezeichnung ?? ''} ${extracted.notiz ?? ''}`
      const suggested = suggestCategory(text)
      if (suggested !== 'sonstiges') {
        extracted.kategorie = suggested
      }
    }

    // Validate kategorie
    if (!BOAT_CATEGORIES.includes(extracted.kategorie as typeof BOAT_CATEGORIES[number])) {
      extracted.kategorie = 'sonstiges'
    }

    // 4. Update ausgaben record
    const { error: updateError } = await supabase
      .from('ausgaben')
      .update({
        bezeichnung: extracted.bezeichnung ?? null,
        betrag: extracted.betrag ?? null,
        datum: extracted.datum ?? null,
        kategorie: extracted.kategorie ?? 'sonstiges',
        treibstoff_liter: extracted.kategorie === 'treibstoff' ? (extracted.liter ?? null) : null,
        notiz: extracted.notiz ?? null,
        verarbeitungs_status: 'fertig',
        extraktion_daten: extracted,
      })
      .eq('id', ausgabe_id)

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`)
    }

    return new Response(JSON.stringify({ success: true, extracted }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('extract-expense error:', err)

    // Try to mark as error in DB
    try {
      const body = await req.clone().json().catch(() => ({}))
      if (body.ausgabe_id) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
        )
        await supabase
          .from('ausgaben')
          .update({
            verarbeitungs_status: 'fehler',
            extraktion_daten: { error: String(err) },
          })
          .eq('id', body.ausgabe_id)
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
