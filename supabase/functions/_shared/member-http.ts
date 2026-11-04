export const MEMBER_CORS = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-upload-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...MEMBER_CORS, 'Content-Type': 'application/json', ...headers },
  })
}

// Limit actual streamed bytes, not just the caller-controlled Content-Length.
export async function readBoundedBody(req: Request, limit: number): Promise<Uint8Array> {
  if (Number(req.headers.get('content-length')) > limit) throw new Error('body limit')
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('body limit') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}
