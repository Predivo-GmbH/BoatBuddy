/**
 * Fleet standard: dynamic Anthropic model resolution (2026-07-05).
 * CANONICAL REFERENCE — copy into <project>/supabase/functions/_shared/anthropic-model.ts
 * and do not diverge functionally. Doc: standards/ai-model-resolution.md
 *
 * No hard-coded model IDs in call sites. The model comes from a Supabase secret
 * (AI_MODEL_FAST / AI_MODEL_SMART) and self-heals via the live /v1/models list
 * when the pinned model has been retired (404 model_not_found).
 */

const MODELS_API = 'https://api.anthropic.com/v1/models?limit=100'
const MESSAGES_API = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export type ModelTier = 'fast' | 'smart'

const TIER_ENV: Record<ModelTier, string> = { fast: 'AI_MODEL_FAST', smart: 'AI_MODEL_SMART' }
const TIER_FAMILY: Record<ModelTier, string> = { fast: 'claude-haiku', smart: 'claude-sonnet' }

let cache: { ids: string[]; at: number } | null = null

/** Live model IDs, newest first. Cached for the lifetime of the isolate (6h TTL). */
async function liveModels(apiKey: string): Promise<string[]> {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.ids
  const res = await fetch(MODELS_API, {
    headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
  })
  if (!res.ok) throw new Error(`models list failed: ${res.status}`)
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id)
  if (ids.length === 0) throw new Error('models list empty')
  cache = { ids, at: Date.now() }
  return ids
}

function familyOf(model: string, tier: ModelTier): string {
  const m = model.match(/^(claude-[a-z]+)/)
  return m ? m[1] : TIER_FAMILY[tier]
}

/** Model to use for a tier: the pinned secret, else newest live model of the tier's family. */
export async function resolveModel(tier: ModelTier, apiKey: string): Promise<string> {
  const pin = Deno.env.get(TIER_ENV[tier])
  if (pin) return pin
  const ids = await liveModels(apiKey)
  return ids.find((id) => id.startsWith(TIER_FAMILY[tier])) ?? ids[0]
}

/** Newest live model in the same family as `failed` (never `failed` itself). */
export async function substituteModel(failed: string, tier: ModelTier, apiKey: string): Promise<string> {
  const ids = await liveModels(apiKey)
  const fam = familyOf(failed, tier)
  const sub =
    ids.find((id) => id.startsWith(fam) && id !== failed) ??
    ids.find((id) => id.startsWith(TIER_FAMILY[tier]) && id !== failed) ??
    ids[0]
  console.error(`[ai-model] "${failed}" unavailable (retired?) — substituting "${sub}". Update the AI_MODEL_* secret.`)
  return sub
}

/** True when the response is Anthropic's "model not found" 404. */
export async function isModelNotFound(res: Response): Promise<boolean> {
  if (res.status !== 404) return false
  try {
    const j = await res.clone().json()
    return JSON.stringify(j).toLowerCase().includes('model')
  } catch {
    return true
  }
}

/**
 * Non-streaming Messages call with automatic retirement fallback.
 * `body` must NOT contain `model` — pass a tier instead. Returns the raw Response.
 */
export async function anthropicMessages(
  apiKey: string,
  tier: ModelTier,
  body: Record<string, unknown>,
): Promise<Response> {
  let model = await resolveModel(tier, apiKey)
  const call = (m: string) =>
    fetch(MESSAGES_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...body, model: m }),
    })
  let res = await call(model)
  if (await isModelNotFound(res)) {
    model = await substituteModel(model, tier, apiKey)
    res = await call(model)
  }
  return res
}
