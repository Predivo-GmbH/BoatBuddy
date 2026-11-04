import { createHash, randomBytes } from 'node:crypto'

export const MEMBER_ID = '07a91df9-55d7-42b4-9944-82f5b88dcf7e'
export const MEMBER_EMAIL = 'members@boatbuddy.invalid'

// Called only after configure-auth's exact release-context guard. Never logs an
// API response, hash, generated password, service key or fetch exception.
export async function provisionMember({ ref, passwordHash, request, fetchImpl }) {
  const keys = await request('GET', '/api-keys?reveal=true')
  const key = keys.find(k => k.type === 'secret' && k.api_key)?.api_key ??
    keys.find(k => k.name === 'service_role')?.api_key
  if (!key) throw new Error('Member provisioning: server API key unavailable')
  async function auth(method, suffix, body, allowMissing = false) {
    let response
    try {
      response = await fetchImpl(`https://${ref}.supabase.co/auth/v1/admin/users${suffix}`, {
        method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error', signal: AbortSignal.timeout(60_000),
      })
    } catch { throw new Error('Member provisioning: transport failure') }
    if (allowMissing && response.status === 404) { await response.body?.cancel(); return null }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Member provisioning: HTTP ${response.status}`)
    }
    try { return await response.json() } catch { throw new Error('Member provisioning: invalid JSON') }
  }
  let user = await auth('GET', `/${MEMBER_ID}`, undefined, true)
  if (!user) {
    user = await auth('POST', '', {
      id: MEMBER_ID, email: MEMBER_EMAIL, email_confirm: true,
      // A random unused Auth password is unrelated to the existing boat password.
      // The public email/password provider remains disabled.
      password: randomBytes(48).toString('base64url'),
      app_metadata: { boatbuddy_member: true },
    })
  }
  // Do not silently reactivate a revoked identity, change its email or adopt an
  // existing unrelated account. Deliberate revocation must survive releases.
  if (user.id !== MEMBER_ID || user.email !== MEMBER_EMAIL ||
      user.app_metadata?.boatbuddy_member !== true || user.deleted_at ||
      (user.banned_until && Date.parse(user.banned_until) > Date.now())) {
    throw new Error('Member provisioning: identity not verified')
  }
  await request('POST', '/secrets', [{ name: 'MEMBER_PASSWORD_HASH', value: passwordHash }])
  const secrets = await request('GET', '/secrets')
  // Management API exposes only SHA-256 digests here (CLI's DIGEST column).
  const expected = createHash('sha256').update(passwordHash).digest('hex')
  if (!secrets.some(s => s.name === 'MEMBER_PASSWORD_HASH' && s.value === expected)) {
    throw new Error('Member provisioning: function secret not verified')
  }
  const verified = await auth('GET', `/${MEMBER_ID}`)
  if (verified.id !== MEMBER_ID || verified.email !== MEMBER_EMAIL || verified.app_metadata?.boatbuddy_member !== true) {
    throw new Error('Member provisioning: identity readback failed')
  }
}
