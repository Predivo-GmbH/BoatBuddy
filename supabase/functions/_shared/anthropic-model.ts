/**
 * Fleet standard: AI provider + model resolution (2026-07-05, provider dimension 2026-07-21).
 * CANONICAL REFERENCE — copy into <project>/supabase/functions/_shared/anthropic-model.ts
 * and do not diverge functionally. Doc: standards/ai-model-resolution.md
 *
 * The file name and the exported function names are unchanged on purpose: every call site
 * in the fleet already imports `anthropicMessages` / `resolveModel`, and this layer must stay
 * a drop-in. What changed is that a call can now be served by a DIFFERENT PROVIDER.
 *
 *   AI_PROVIDER           primary   — 'anthropic' (default) | 'kimi'
 *   AI_FALLBACK_PROVIDER  optional  — used only when the primary fails RETRYABLY (5xx/429/network)
 *   AI_MODEL_FAST / AI_MODEL_SMART        Anthropic pins (unchanged)
 *   KIMI_MODEL_FAST / KIMI_MODEL_SMART    Kimi pins (default kimi-k2.6)
 *   MOONSHOT_API_KEY                      Kimi credential
 *
 * With nothing configured the behaviour is byte-for-byte the old Anthropic-only path.
 *
 * ⚠️ THE ONE THING THAT WILL BITE YOU (verified 2026-07-21, Gate B):
 * Kimi returns `content = [thinking, text]` by default. Every call site in this fleet reads
 * `data.content[0].text`, which is then `undefined` — on HTTP 200, with no error. ReplyFlow at
 * its real max_tokens=350 produced a COMPLETELY BLANK reply because thinking ate the budget.
 * We therefore force `thinking: {type: 'disabled'}` on every Kimi request. Only kimi-k2.6
 * supports disabling it — k2.7-code is always-on and k3 only has reasoning_effort.
 * Never send `thinking` to Anthropic here: Haiku/Sonnet 4.5-class models reject that shape.
 */

const ANTHROPIC_VERSION = '2023-06-01'

export type ModelTier = 'fast' | 'smart'
export type Provider = 'anthropic' | 'kimi'

interface ProviderConfig {
  messagesUrl: string
  modelsUrl: string
  /** Env var holding this provider's credential (Anthropic falls back to the caller's key). */
  keyEnv: string
  pinEnv: Record<ModelTier, string>
  family: Record<ModelTier, string>
  headers: (key: string) => Record<string, string>
  /** Provider-specific request-body adjustments. */
  shapeBody: (body: Record<string, unknown>) => Record<string, unknown>
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  anthropic: {
    messagesUrl: 'https://api.anthropic.com/v1/messages',
    modelsUrl: 'https://api.anthropic.com/v1/models?limit=100',
    keyEnv: 'ANTHROPIC_API_KEY',
    pinEnv: { fast: 'AI_MODEL_FAST', smart: 'AI_MODEL_SMART' },
    family: { fast: 'claude-haiku', smart: 'claude-sonnet' },
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    }),
    shapeBody: (body) => body,
  },
  kimi: {
    // Moonshot ships an Anthropic-compatible Messages endpoint, so the request/response
    // shape — including usage.input_tokens/output_tokens — matches ours as-is.
    messagesUrl: 'https://api.moonshot.ai/anthropic/v1/messages',
    modelsUrl: 'https://api.moonshot.ai/v1/models',
    keyEnv: 'MOONSHOT_API_KEY',
    pinEnv: { fast: 'KIMI_MODEL_FAST', smart: 'KIMI_MODEL_SMART' },
    family: { fast: 'kimi-k2.6', smart: 'kimi-k2.6' },
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    }),
    // See the warning at the top of this file — without this the response has no text block.
    shapeBody: (body) => ({ thinking: { type: 'disabled' }, ...body }),
  },
}

function primaryProvider(): Provider {
  return Deno.env.get('AI_PROVIDER') === 'kimi' ? 'kimi' : 'anthropic'
}

function fallbackProvider(): Provider | null {
  const v = Deno.env.get('AI_FALLBACK_PROVIDER')
  if (v === 'kimi' || v === 'anthropic') return v
  return null
}

/** Credential for a provider. Anthropic falls back to the key the caller already passed. */
function keyFor(provider: Provider, callerKey: string): string | null {
  const fromEnv = Deno.env.get(PROVIDERS[provider].keyEnv)
  if (fromEnv) return fromEnv
  return provider === 'anthropic' ? callerKey : null
}

const cache: Partial<Record<Provider, { ids: string[]; at: number }>> = {}

/** Live model IDs for a provider, newest first. Cached for the isolate's lifetime (6h TTL). */
async function liveModels(provider: Provider, apiKey: string): Promise<string[]> {
  const hit = cache[provider]
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.ids
  const cfg = PROVIDERS[provider]
  const res = await fetch(cfg.modelsUrl, { headers: cfg.headers(apiKey) })
  if (!res.ok) throw new Error(`models list failed (${provider}): ${res.status}`)
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id)
  if (ids.length === 0) throw new Error(`models list empty (${provider})`)
  cache[provider] = { ids, at: Date.now() }
  return ids
}

function familyOf(model: string, provider: Provider, tier: ModelTier): string {
  const m = model.match(/^([a-z]+-[a-z0-9.]+)/)
  return m ? m[1] : PROVIDERS[provider].family[tier]
}

/**
 * Model to use for a tier: the pinned secret, else the newest live model of the tier's family.
 * Defaults to the primary provider; pass `provider` to resolve for a specific one.
 */
export async function resolveModel(tier: ModelTier, apiKey: string, provider?: Provider): Promise<string> {
  const p = provider ?? primaryProvider()
  const cfg = PROVIDERS[p]
  const pin = Deno.env.get(cfg.pinEnv[tier])
  if (pin) return pin
  const key = keyFor(p, apiKey)
  if (!key) throw new Error(`no credential for provider ${p} (${cfg.keyEnv})`)
  const ids = await liveModels(p, key)
  return ids.find((id) => id.startsWith(cfg.family[tier])) ?? ids[0]
}

/** Newest live model in the same family as `failed` (never `failed` itself). */
export async function substituteModel(
  failed: string, tier: ModelTier, apiKey: string, provider?: Provider,
): Promise<string> {
  const p = provider ?? primaryProvider()
  const cfg = PROVIDERS[p]
  const key = keyFor(p, apiKey)
  if (!key) throw new Error(`no credential for provider ${p}`)
  const ids = await liveModels(p, key)
  const fam = familyOf(failed, p, tier)
  const sub =
    ids.find((id) => id.startsWith(fam) && id !== failed) ??
    ids.find((id) => id.startsWith(cfg.family[tier]) && id !== failed) ??
    ids[0]
  console.error(`[ai-model] "${failed}" unavailable (retired?) — substituting "${sub}". Update the pin secret.`)
  return sub
}

/** True when the response is the provider's "model not found" 404. */
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
 * Non-streaming Messages call with automatic model-retirement fallback and, when
 * AI_FALLBACK_PROVIDER is set, automatic PROVIDER failover.
 *
 * Failover policy (Roger, 2026-07-23): if the primary cannot produce a result for ANY
 * reason, fall over to the second provider — full stop. That means not just 429/5xx/network
 * but ALSO 4xx: 401/403 (a revoked key or exhausted quota is exactly when the OTHER
 * provider's key saves the call) and 400 (e.g. Kimi rejecting a `document` PDF block — the
 * fallback Anthropic then handles it). The only cost is that a genuinely malformed request
 * now makes one wasted extra call before surfacing the error; resilience wins that trade.
 * `body` must NOT contain `model` — pass a tier instead. Returns the raw Response.
 */
export async function anthropicMessages(
  apiKey: string,
  tier: ModelTier,
  body: Record<string, unknown>,
): Promise<Response> {
  const order: Provider[] = [primaryProvider()]
  const fb = fallbackProvider()
  if (fb && fb !== order[0]) order.push(fb)

  let lastRes: Response | null = null
  for (let i = 0; i < order.length; i++) {
    const provider = order[i]
    const cfg = PROVIDERS[provider]
    const key = keyFor(provider, apiKey)
    if (!key) {
      console.error(`[ai-model] skipping provider ${provider} — ${cfg.keyEnv} not set`)
      continue
    }

    let model: string
    try {
      model = await resolveModel(tier, apiKey, provider)
    } catch (e) {
      console.error(`[ai-model] cannot resolve model for ${provider}: ${(e as Error).message}`)
      continue
    }

    const call = (m: string) =>
      fetch(cfg.messagesUrl, {
        method: 'POST',
        headers: cfg.headers(key),
        body: JSON.stringify(cfg.shapeBody({ ...body, model: m })),
      })

    const next = order[i + 1]
    let res: Response
    try {
      res = await call(model)
      if (await isModelNotFound(res)) {
        model = await substituteModel(model, tier, apiKey, provider)
        res = await call(model)
      }
    } catch (e) {
      // Network-level failure (DNS, TLS, timeout): the primary produced nothing at all.
      console.error(`[ai-model] ${provider} network error: ${(e as Error).message}` +
        (next ? ` — failing over to ${next}` : ''))
      lastRes = new Response(JSON.stringify({ error: `${provider} network error: ${(e as Error).message}` }), { status: 503 })
      continue
    }

    // Success is the only thing that stops us. ANY failure falls over to the next provider.
    if (res.ok) return res
    lastRes = res
    if (next) {
      console.error(`[ai-model] ${provider} returned ${res.status} — failing over to ${next}`)
    }
  }
  // Every configured provider failed; hand back the last response so the caller sees a real
  // status code rather than a synthetic one.
  return lastRes ?? new Response(JSON.stringify({ error: 'no AI provider available' }), { status: 503 })
}
