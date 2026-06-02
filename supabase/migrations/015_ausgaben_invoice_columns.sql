-- Migration 015: Add invoice extraction columns to ausgaben
-- These columns support the upload → AI extraction pipeline

ALTER TABLE public.ausgaben ADD COLUMN IF NOT EXISTS dokument_pfad text;
ALTER TABLE public.ausgaben ADD COLUMN IF NOT EXISTS verarbeitungs_status text;
ALTER TABLE public.ausgaben ADD COLUMN IF NOT EXISTS extraktion_daten jsonb;
