import { jsonResponse, MEMBER_CORS, readBoundedBody } from '../_shared/member-http.ts'

export interface UploadSession { id: string; status: string; expires_at: string }
export interface PhoneDependencies {
  lookup: (token: string) => Promise<UploadSession | null>
  upload: (path: string, bytes: Uint8Array) => Promise<void>
  complete: (token: string, path: string, now: string) => Promise<boolean>
  now?: () => number
}

export function createPhoneHandler(deps: PhoneDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: MEMBER_CORS })
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
    const token = req.headers.get('x-upload-token') ?? ''
    if (!/^[0-9a-f]{32}$/.test(token)) return jsonResponse({ error: 'Invalid upload' }, 404)
    try {
      const now = () => deps.now?.() ?? Date.now()
      const session = await deps.lookup(token)
      if (!session || session.status !== 'pending' || Date.parse(session.expires_at) <= now() ||
          !Number.isFinite(Date.parse(session.expires_at))) return jsonResponse({ error: 'Invalid upload' }, 404)
      const type = req.headers.get('content-type')?.split(';')[0]
      if (type === 'application/json') {
        // Validation returns no row data, storage path, token list or member pass.
        await readBoundedBody(req, 32)
        return jsonResponse({ valid: true })
      }
      if (type !== 'image/jpeg') return jsonResponse({ error: 'JPEG required' }, 415)
      let bytes: Uint8Array
      try { bytes = await readBoundedBody(req, 10 * 1024 * 1024) }
      catch { return jsonResponse({ error: 'Photo too large' }, 413) }
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
        return jsonResponse({ error: 'JPEG required' }, 415)
      }
      if (Date.parse(session.expires_at) <= now()) return jsonResponse({ error: 'Invalid upload' }, 404)
      const path = `phone-uploads/${token}/photo.jpg`
      // upsert:false means concurrent/replayed requests cannot replace a receipt.
      await deps.upload(path, bytes)
      // DB compares pending status and expiry again at completion, after upload.
      if (!await deps.complete(token, path, new Date(now()).toISOString())) return jsonResponse({ error: 'Invalid upload' }, 409)
      return jsonResponse({ success: true })
    } catch { return jsonResponse({ error: 'Upload unavailable' }, 503) }
  }
}
