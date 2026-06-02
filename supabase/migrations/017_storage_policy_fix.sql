-- Migration 017: Storage policies for root-level invoice uploads
-- InvoiceUpload.tsx and FinanzenPage.tsx upload to the root of the dokumente bucket,
-- but migration 013 only allows uploads to the phone-uploads/ prefix.

-- Allow anon to upload invoices at root level of dokumente bucket
CREATE POLICY "Anon can upload invoices"
  ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'dokumente'
    AND (storage.foldername(name))[1] IS DISTINCT FROM 'phone-uploads'
  );

-- Allow anon to read all files in dokumente bucket (not just phone-uploads/)
CREATE POLICY "Anon can read invoices"
  ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'dokumente'
    AND (storage.foldername(name))[1] IS DISTINCT FROM 'phone-uploads'
  );
