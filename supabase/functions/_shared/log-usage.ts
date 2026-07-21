/**
 * Fleet standard: Anthropic / Gemini API usage logging (canonical reference).
 * CANONICAL REFERENCE — copy into <project>/supabase/functions/_shared/log-usage.ts
 * and do not diverge functionally. Doc: standards/ai-model-resolution.md
 *
 * Reports every AI call to BackOffice `api_usage_log`, which powers
 * https://backoffice.predivo.ch/api-dashboard.
 *
 * Usage (non-streaming):
 *   const res = await anthropicMessages(apiKey, 'fast', {...})
 *   const json = await res.json()
 *   await logAnthropicUsage('BackOffice', 'process-bill', json)
 *
 * Usage (streaming — pass tokens manually):
 *   await logAnthropicUsage('Valrano', 'ai-chat', { model, usage: { input_tokens: 500, output_tokens: 200 } })
 *
 * IMPORTANT: Supabase kills pending fetches when the edge function returns.
 * Callers MUST `await` this before returning their response.
 */

// Per-million-token pricing (USD). Exact model IDs first, then family prefixes so
// dated snapshots and aliases (claude-sonnet-4-6-20260101, claude-haiku-4-5, ...)
// price correctly instead of silently falling through to `default`.
// Source: Anthropic pricing table, verified 2026-07-21.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Google Gemini — exact IDs
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  // Fallback for entirely unknown models
  'default': { input: 3, output: 15 },
}

// Longest-prefix wins. Anthropic Opus-tier is 5/25 (NOT the old 15/75 — that was
// Claude 3 Opus pricing and over-charged every opus-4-x call by 3x).
// Kimi (Moonshot) verified against their pricing docs 2026-07-21. NOTE kimi-k2.6 at
// 0.95/4.00 UNDERCUTS Anthropic Haiku 4.5 (1/5), which is the tier most of the fleet runs on.
const FAMILY_PRICING: Array<[string, { input: number; output: number }]> = [
  ['kimi-k2.6', { input: 0.95, output: 4 }],
  ['kimi-k2.7-code-highspeed', { input: 1.90, output: 8 }],
  ['kimi-k2.7-code', { input: 0.95, output: 4 }],
  ['kimi-k3', { input: 3, output: 15 }],
  ['kimi', { input: 0.95, output: 4 }],
  ['claude-fable-5', { input: 10, output: 50 }],
  ['claude-mythos', { input: 10, output: 50 }],
  ['claude-opus', { input: 5, output: 25 }],
  ['claude-sonnet', { input: 3, output: 15 }],
  ['claude-haiku', { input: 1, output: 5 }],
  ['gemini-2.5-flash', { input: 0.30, output: 2.50 }],
  ['gemini', { input: 1.25, output: 10 }],
]

const BACKOFFICE_URL = 'https://xoecpzfsskalvjrtcbbl.supabase.co/functions/v1/log-api-usage'
const CRON_SECRET = Deno.env.get('BACKOFFICE_CRON_SECRET') ?? ''

interface AnthropicResponse {
  model?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

function pricingFor(model: string): { input: number; output: number } {
  const exact = MODEL_PRICING[model]
  if (exact) return exact
  let best: { input: number; output: number } | null = null
  let bestLen = -1
  for (const [prefix, price] of FAMILY_PRICING) {
    if (model.startsWith(prefix) && prefix.length > bestLen) {
      best = price
      bestLen = prefix.length
    }
  }
  return best ?? MODEL_PRICING['default']
}

/** Cost in USD for a call, from the shared pricing table (single source of truth). */
export function costUsdFor(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = pricingFor(model)
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}

export async function logAnthropicUsage(
  projectName: string,
  edgeFunction: string,
  response: AnthropicResponse,
): Promise<void> {
  const model = response.model ?? 'unknown'
  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0

  const cost = costUsdFor(model, inputTokens, outputTokens)
  // Provider is derived from the model ID so a provider failover is attributed correctly
  // on the BackOffice API dashboard without the call site having to know what served it.
  const provider = model.startsWith('gemini') ? 'google'
    : model.startsWith('kimi') || model.startsWith('moonshot') ? 'kimi'
    : 'anthropic'

  // A missing secret is the #1 cause of silent under-reporting — say so loudly.
  if (!CRON_SECRET) {
    console.error(
      `[log-usage] BACKOFFICE_CRON_SECRET is not set — usage for ${projectName}/${edgeFunction} will NOT be recorded.`,
    )
    return
  }

  try {
    const res = await fetch(BACKOFFICE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_name: projectName,
        edge_function: edgeFunction,
        provider,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
      }),
    })
    // NEVER swallow this silently: a 401/403 here is invisible everywhere else and
    // makes the API dashboard under-report real spend (see the 2026-07-21 audit).
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(
        `[log-usage] FAILED ${res.status} for ${projectName}/${edgeFunction}: ${body.slice(0, 200)}`,
      )
    }
  } catch (e) {
    // Network-level failure — logging must never break the calling function,
    // but it must never be invisible either.
    console.error(`[log-usage] ERROR for ${projectName}/${edgeFunction}: ${(e as Error).message}`)
  }
}
