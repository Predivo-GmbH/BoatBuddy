import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2'
import { createReportHandler } from './handler.ts'

// Request-local clients, as in member-session: the service role writes the row, nothing else can
// (migration 0341: no browser role may read or write client_error_reports).
Deno.serve(req => {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const serverKey = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serverKey, options)
  return createReportHandler({
    hmacKey: serverKey,
    async bump(key, window) {
      const { data, error } = await admin.rpc('bump_extract_rate', { p_key: key, p_window: window })
      if (error) throw new Error('rate unavailable')
      return data
    },
    async userIdOf(bearer) {
      // Auth verifies signature and expiry; the public API key is not a user and yields null.
      const { data, error } = await admin.auth.getUser(bearer)
      return !error && data.user ? data.user.id : null
    },
    async store(row) {
      // 200 only once the row is really there: insert, read the reference back.
      const { data, error } = await admin.from('client_error_reports').insert(row).select('reference').single()
      if (error?.code === '23505') return 'duplicate'
      if (error || data?.reference !== row.reference) throw new Error('store')
      return 'stored'
    },
  })(req)
})
