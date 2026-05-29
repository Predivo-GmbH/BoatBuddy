-- Migration 013: Phone upload sessions for mobile invoice capture
-- Allows scanning QR code on desktop, then taking a photo on phone

CREATE TABLE public.phone_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'expired')),
  storage_path text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz
);

-- RLS: anon can validate pending sessions within TTL
ALTER TABLE public.phone_upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read pending sessions by token"
  ON public.phone_upload_sessions
  FOR SELECT TO anon
  USING (status IN ('pending', 'uploaded') AND expires_at > now());

CREATE POLICY "Anon can mark session as uploaded"
  ON public.phone_upload_sessions
  FOR UPDATE TO anon
  USING (status = 'pending' AND expires_at > now())
  WITH CHECK (status = 'uploaded');

CREATE POLICY "Anon can create sessions"
  ON public.phone_upload_sessions
  FOR INSERT TO anon
  WITH CHECK (true);

-- Storage: anon can upload to phone-uploads/ prefix only
CREATE POLICY "Anon can upload phone photos"
  ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'dokumente'
    AND (storage.foldername(name))[1] = 'phone-uploads'
  );

-- Anon can read phone-uploads/ (for preview on phone after capture)
CREATE POLICY "Anon can read phone uploads"
  ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'dokumente'
    AND (storage.foldername(name))[1] = 'phone-uploads'
  );
