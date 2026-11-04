import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2'
import { createPhoneHandler } from './handler.ts'

Deno.serve(req => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { persistSession: false, autoRefreshToken: false } })
  return createPhoneHandler({
    async lookup(token) {
      const { data, error } = await admin.from('phone_upload_sessions')
        .select('id,status,expires_at').eq('token', token).eq('status', 'pending')
        .gt('expires_at', new Date().toISOString()).maybeSingle()
      if (error) throw new Error('lookup')
      return data
    },
    async upload(path, bytes) {
      const { error } = await admin.storage.from('dokumente').upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
      // An earlier upload may have succeeded while completion's response failed.
      // An existing immutable object is safe to complete; never overwrite it.
      if (error && String(error.statusCode) !== '409') throw new Error('upload')
    },
    async complete(token, path, now) {
      const { data, error } = await admin.from('phone_upload_sessions')
        .update({ status: 'uploaded', storage_path: path, uploaded_at: now })
        .eq('token', token).eq('status', 'pending').gt('expires_at', now).select('id')
      if (error) throw new Error('complete')
      return data?.length === 1
    },
  })(req)
})
