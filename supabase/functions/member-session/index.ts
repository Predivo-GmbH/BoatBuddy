import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2'
import { createMemberHandler, MEMBER_EMAIL, SHARED_MEMBER_ID, type MemberSession } from './handler.ts'

// Request-local clients: verifyOtp must never mutate a shared service-role client.
Deno.serve(async req => {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const url = Deno.env.get('SUPABASE_URL')!
  const serverKey = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  const admin = createClient(url, serverKey, options)
  return createMemberHandler({
    passwordHash: Deno.env.get('MEMBER_PASSWORD_HASH') ?? '',
    async bump(key, window) {
      const { data, error } = await admin.rpc('bump_extract_rate', { p_key: key, p_window: window })
      if (error) throw new Error('rate unavailable')
      return data
    },
    async issueSession() {
      // Only the release-provisioned account may be used; never auto-enrol users.
      const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(SHARED_MEMBER_ID)
      if (lookupError || existing.user?.email !== MEMBER_EMAIL || existing.user.app_metadata.boatbuddy_member !== true) {
        throw new Error('member unavailable')
      }
      // Admin generateLink sends no mail. Consume the token on this server, never
      // return it. Public email auth stays disabled. Retry one simultaneous login
      // collision (GoTrue has one current magic-link token per shared account).
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: MEMBER_EMAIL })
        if (error || link.user.id !== SHARED_MEMBER_ID || !link.properties.hashed_token) throw new Error('link unavailable')
        // Separate request-local client so consuming the OTP never replaces the
        // admin client's bearer. Works when legacy public API keys are disabled.
        const auth = createClient(url, serverKey, options)
        const { data, error: verifyError } = await auth.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token })
        if (!verifyError && data.session) return data.session as MemberSession
        if (verifyError?.code !== 'otp_expired') break
      }
      throw new Error('session unavailable')
    },
  })(req)
})
