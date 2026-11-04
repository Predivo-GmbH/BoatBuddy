interface AuthVerifier {
  auth: { getUser: (token: string) => Promise<{
    data: { user: { app_metadata: Record<string, unknown> } | null }
    error: unknown
  }> }
}

// Supabase Auth verifies signature, expiry and audience. Never decode a bearer
// and trust its member claim, or treat the public API key as authentication.
export async function requireMember(req: Request, client: AuthVerifier): Promise<boolean> {
  const authorization = req.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return false
  try {
    const { data, error } = await client.auth.getUser(authorization.slice(7))
    return !error && data.user?.app_metadata.boatbuddy_member === true
  } catch { return false }
}
