-- Add startsaldo to boot_stats for calculated Kontostand anchoring
-- This offset makes the auto-calculated balance match the real bank balance
alter table public.boot_stats add column startsaldo numeric(10,2) not null default 0;
