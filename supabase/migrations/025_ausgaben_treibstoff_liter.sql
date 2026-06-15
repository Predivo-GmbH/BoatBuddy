-- 025: Capture litres on the fuel receipt (expense), so fuel stats can sum litres
-- in addition to cost. Only meaningful for kategorie = 'treibstoff'.
ALTER TABLE public.ausgaben ADD COLUMN IF NOT EXISTS treibstoff_liter numeric;
