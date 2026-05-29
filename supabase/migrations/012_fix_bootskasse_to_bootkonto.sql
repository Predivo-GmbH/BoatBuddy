-- Migration 012: Harmonize bezahlt_von values
-- Historical migration 007 used 'bootskasse' as default, but the UI uses 'bootkonto'.
-- Fix: update all existing records and change the default.

UPDATE public.ausgaben SET bezahlt_von = 'bootkonto' WHERE bezahlt_von = 'bootskasse';

ALTER TABLE public.ausgaben ALTER COLUMN bezahlt_von SET DEFAULT 'bootkonto';
