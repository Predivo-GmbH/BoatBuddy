-- Migration 007: Historical data support
-- Adds Pedro as historical fahrer, expands categories, adds fuel tracking table

-- 1. Remove UNIQUE constraint on nutzungslogs.datum (multiple outings per day in historical data)
ALTER TABLE public.nutzungslogs DROP CONSTRAINT IF EXISTS nutzungslogs_datum_key;
DROP INDEX IF EXISTS nutzungslogs_datum_key;

-- 2. Add participants array and motor hours running total to nutzungslogs
ALTER TABLE public.nutzungslogs ADD COLUMN IF NOT EXISTS teilnehmer text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.nutzungslogs ADD COLUMN IF NOT EXISTS motorstunden_stand numeric(8,2);

-- 3. Make aktivitaeten optional (historical outings don't have activity breakdown)
ALTER TABLE public.nutzungslogs ALTER COLUMN aktivitaeten SET DEFAULT '[]';

-- 4. Create fuel tracking table (Tanken)
CREATE TABLE IF NOT EXISTS public.tanken (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datum           date NOT NULL,
  fahrer          text NOT NULL,
  ort             text,
  betrag          numeric(10,2) NOT NULL,
  liter           numeric(6,2),
  motorstunden_stand numeric(8,2),
  notiz           text,
  erstellt_am     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tanken_datum ON public.tanken(datum DESC);
CREATE INDEX IF NOT EXISTS idx_tanken_fahrer ON public.tanken(fahrer);

ALTER TABLE public.tanken ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON public.tanken FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Add bezahlt_von to ausgaben (who paid: bootskasse, roger, dani, pedro)
ALTER TABLE public.ausgaben ADD COLUMN IF NOT EXISTS bezahlt_von text NOT NULL DEFAULT 'bootskasse';

-- 6. Update boot_stats with actual purchase data
UPDATE public.boot_stats SET
  gesamtstunden = 939,
  kaufdatum = '2021-09-05',
  modell = 'Mastercraft X2',
  motorstunden_grenze = 1000,
  notiz = 'Kauf über Mats Bühler, MMC GmbH Knonau. Kaufpreis CHF 55000 (Roger 40k, Pedro 7.5k, Dani 7.5k). Motor-h bei Kauf: ~695.'
WHERE modell = 'Mastercraft';
